import mongoose from "mongoose";
import amqp from "amqplib";
import type { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import logger from "../utils/logger";
import R2Service from "../services/R2Service";
import { Vod, Stream } from "../models";

interface VODJobData {
  streamId: string;
  webmPath: string;
  userId: string;
}

class VODWorker {
  private connection: ChannelModel | null;
  private channel: Channel | null;
  private r2Service: R2Service | null;

  constructor() {
    this.connection = null;
    this.channel = null;
    this.r2Service = null;
  }

  async start(): Promise<void> {
    try {
      await mongoose.connect(
        process.env.DATABASE_URL || "mongodb://localhost:27018/streamhub",
      );
      logger.info("VOD Worker: Database connected");

      this.r2Service = new R2Service(logger);

      this.connection = await amqp.connect(
        process.env.RABBITMQ_URL || "amqp://localhost:5672",
      );

      this.channel = await this.connection.createChannel();
      this.channel.prefetch(1);

      await this.channel.assertExchange("vod.dlx", "direct", {
        durable: true,
      });

      await this.channel.assertQueue("vod.conversion.dlq", {
        durable: true,
      });

      await this.channel.bindQueue(
        "vod.conversion.dlq",
        "vod.dlx",
        "vod.conversion",
      );

      await this.channel.assertQueue("vod.conversion", {
        durable: true,
        maxLength: 1000,
        arguments: {
          "x-dead-letter-exchange": "vod.dlx",
          "x-dead-letter-routing-key": "vod.conversion",
        },
      });

      logger.info("VOD Worker: Started, waiting for jobs...");

      this.channel.consume(
        "vod.conversion",
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;

          try {
            const data: VODJobData & { attempts?: number } = JSON.parse(
              msg.content.toString(),
            );
            data.attempts = (data.attempts || 0) + 1;
            await this.processVOD(data);
            this.channel?.ack(msg);
          } catch (error) {
            logger.error("VOD processing failed", error);
            const data = JSON.parse(msg.content.toString());
            const attempts = (data.attempts ?? 0) + 1;
            if (attempts < 3) {
              const retryMsg = Buffer.from(
                JSON.stringify({ ...data, attempts }),
              );
              this.channel?.nack(msg, false, false);
              this.channel?.sendToQueue("vod.conversion", retryMsg, {
                persistent: true,
              });
            } else {
              this.channel?.nack(msg, false, false); 
            }
          }
        },
      );
    } catch (error) {
      logger.error("VOD Worker: Startup failed", error);
      process.exit(1);
    }
  }

  async processVOD(data: VODJobData): Promise<void> {
    const { streamId, webmPath, userId } = data;
    const recordingsDir = "/tmp/recordings";
    const mp4Path = path.join(recordingsDir, `${streamId}-${Date.now()}.mp4`);

    logger.info(`Processing VOD: ${streamId}`);

    try {
      await fs.promises.mkdir(recordingsDir, { recursive: true });

      const stream = await Stream.findOne({ id: streamId });
      if (!stream) {
        logger.error(`Stream ${streamId} not found`);
        await fs.promises.unlink(webmPath).catch(() => {});
        return;
      }

      // FFmpeg conversion
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", [
          "-y",
          "-fflags",
          "+genpts",
          "-i",
          webmPath,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          mp4Path,
        ]);

        ffmpeg.stderr.on("data", (data: Buffer) => {
          logger.info(`[ffmpeg] ${data.toString()}`);
        });

        ffmpeg.on("error", (err: Error) => {
          logger.error("FFmpeg spawn error", err);
          reject(err);
        });

        ffmpeg.on("close", (code: number | null) => {
          if (code !== 0) {
            reject(new Error(`FFmpeg exited with code ${code}`));
          } else {
            resolve();
          }
        });
      });

      const r2Key = `vods/${streamId}/${Date.now()}.mp4`;
      await this.r2Service!.uploadFile(mp4Path, r2Key);

      const stats = await fs.promises.stat(mp4Path);

      // Get duration via ffprobe
      let duration = 0;
      try {
        const ffprobeOut = await new Promise<string>((resolve, reject) => {
          const ffprobe = spawn("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            mp4Path,
          ]);
          let out = "";
          ffprobe.stdout.on("data", (d: Buffer) => {
            out += d.toString();
          });
          ffprobe.on("close", (code: number | null) =>
            code === 0
              ? resolve(out.trim())
              : reject(new Error(`ffprobe exited ${code}`)),
          );
          ffprobe.on("error", reject);
        });
        duration = Math.round(parseFloat(ffprobeOut));
      } catch (e) {
        const error = e as Error;
        logger.warn("ffprobe failed, duration unknown", error.message);
      }

      await Vod.create({
        streamId,
        userId: stream.userId,
        title: stream.title,
        description: stream.description,
        category: stream.category,
        thumbnail: stream.thumbnail,
        r2Key,
        fileSize: stats.size,
        filename: `${streamId}_${Date.now()}.mp4`,
        duration,
        status: "ready",
      });

      await fs.promises.unlink(webmPath).catch(() => {});
      await fs.promises.unlink(mp4Path).catch(() => {});

      logger.info(`VOD processed and saved: ${streamId}`);
    } catch (error) {
      if (mp4Path) await fs.promises.unlink(mp4Path).catch(() => {});
      logger.error(`Error processing VOD: ${streamId}`, error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
    await mongoose.disconnect();
    logger.info("VOD worker stopped");
  }
}

const worker = new VODWorker();
worker.start();

process.on("SIGINT", async () => {
  await worker.stop();
  process.exit(0);
});

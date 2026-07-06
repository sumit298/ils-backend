import { Types } from "mongoose";
import type { Logger } from "winston";
import type MediaService from "../MediaService";
import TTSService from "../TTSService";
import GeminiService from "../GeminiService";
import AudioStreamProducer from "./AudioStreamProducer";
import AIStreamer, { IAIStreamer } from "../../models/AIStreamer";
import Stream from "../../models/Stream";
import User from "../../models/User";

interface StartStreamerConfig {
  ownerId: string;
  topic: string;
  persona: string;
  voice: "male" | "female" | "british";
  title?: string;
  idlePromptIntervalMs?: number;
  maxDurationMs?: number;
}

interface RuntimeState {
  audioProducer: AudioStreamProducer;
  mediaSoupProducer: unknown; // Replace with actual MediaSoup producer type
  roomId: string;
  queue: string[];
  isSpeaking: boolean;
  idleTimer: NodeJS.Timeout | null;
  maxDurationTimer: NodeJS.Timeout | null;
}

class AIStreamerService {
  private logger: Logger;
  private mediaService: MediaService;
  private activeStreamers: Map<string, RuntimeState> = new Map();

  constructor(logger: Logger, mediaService: MediaService) {
    this.logger = logger;
    this.mediaService = mediaService;
  }

  async startStreamer(config: StartStreamerConfig): Promise<IAIStreamer> {
    const streamId = `ai-stream-${Date.now()}`;
    const aiUserId = `ai-user-${streamId}`;

    // create mediasoup room + transport + producer
    await this.mediaService.createRoom(streamId);
    const { transport, rtpPort } = await this.mediaService.createPlainTransport(
      streamId,
      aiUserId,
    );
    const mediaSoupProducer = await this.mediaService.produceOnPlainTransport(
      streamId,
      aiUserId,
      transport,
      "audio",
    );
    const producerSsrc = mediaSoupProducer.rtpParameters.encodings[0].ssrc;
    this.logger.info(`Created MediaSoup producer with SSRC: ${producerSsrc}`);

    // start ffmpeg
    const audioProducer = new AudioStreamProducer(this.logger);
    await audioProducer.startStream(rtpPort, producerSsrc);

    // warm up rtp pipeline with silence
    const silenceBuffer = Buffer.alloc(48000 * 2 * 0.1);
    await audioProducer.streamSegment(silenceBuffer);
    await new Promise((resolve) => setTimeout(resolve, 500));
    this.logger.info("Warmed up RTP pipeline with silence");

    // create AIStreamer document
    let ownerUser = await User.findById(config.ownerId);
    if (!ownerUser) {
      throw new Error(`User with ID ${config.ownerId} not found`);
    }

    await Stream.deleteOne({ id: streamId });
    await Stream.create({
      id: streamId,
      userId: ownerUser._id,
      title: config.title || `🤖 ${config.persona} — ${config.topic}`,
      description: `AI-generated podcast on ${config.topic}`,
      category: "technology",
      tags: ["AI", "podcast"],
      isLive: true,
      startedAt: new Date(),
    });

    const streamer = await AIStreamer.create({
      ownerId: new Types.ObjectId(config.ownerId),
      streamId,
      topic: config.topic,
      persona: config.persona,
      voice: config.voice,
      status: "live",
      startedAt: new Date(),
      config: {
        idlePromptIntervalMs: config.idlePromptIntervalMs || 30000,
        maxDurationMs: config.maxDurationMs || 3600000,
      },
    });

    // store runtime state
    const runtimeState: RuntimeState = {
      audioProducer,
      mediaSoupProducer,
      roomId: streamId,
      queue: [],
      isSpeaking: false,
      idleTimer: null,
      maxDurationTimer: null,
    };
    this.activeStreamers.set(streamer.id, runtimeState);

    // generate and stream opening monologue (non-blocking)
    this.generateOpeningMonologue(streamer, runtimeState).catch((err) =>
      this.logger.error("Opening monologue error:", err),
    );

    // idle timer
    this.resetIdleTimer(streamer, runtimeState);

    // 8. Auto-stop after maxDurationMs
    runtimeState.maxDurationTimer = setTimeout(
      () =>
        this.stopStreamer(streamer.id).catch((err) =>
          this.logger.error("Auto-stop error:", err),
        ),
      streamer.config.maxDurationMs,
    );
    this.logger.info(
      `Started AI streamer with ID ${streamer._id} for user ${config.ownerId}`,
    );
    return streamer;
  }

  async stopStreamer(streamerId: string): Promise<void> {
    const runtime = this.activeStreamers.get(streamerId);
    if (!runtime) {
      this.logger.warn(`No active runtime found for streamer ID ${streamerId}`);
      return;
    }
    this.activeStreamers.delete(streamerId);

    // stop timers
    if (runtime.idleTimer) {
      clearTimeout(runtime.idleTimer);
    }
    if (runtime.maxDurationTimer) {
      clearTimeout(runtime.maxDurationTimer);
    }

    // stop ffmpeg audio producer
    try {
      await runtime.audioProducer.endStream();
    } catch (err) {
      runtime.audioProducer.cleanup();
    }

    // close mediasoup participant and room
    try {
      await this.mediaService.closeParticipant(
        runtime.roomId,
        `ai-user-${runtime.roomId}`,
      );
    } catch (err) {
      this.logger.error(
        `Error closing AI participant for streamer ${streamerId}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    // update db
    await AIStreamer.updateOne(
      { _id: streamerId },
      { status: "ended", endedAt: new Date() },
    );
    await Stream.updateOne(
      { id: runtime.roomId },
      { isLive: false, endedAt: new Date() },
    );
  }

  async handleChatMessage(
    streamerId: string,
    username: string,
    message: string,
  ): Promise<void> {
    const runtime = this.activeStreamers.get(streamerId);
    if (!runtime) {
      this.logger.warn(`No active runtime found for streamer ID ${streamerId}`);
      return;
    }

    const streamer = await AIStreamer.findById(streamerId);
    if (!streamer || streamer.status !== "live") {
      return;
    }

    await AIStreamer.updateOne({ _id: streamerId }, { lastChatAt: new Date() });
    this.resetIdleTimer(streamer, runtime);

    const text = await this.generateChatResponse(streamer, username, message);
    this.enqueueSpeech(streamerId, text);
  }

  private enqueueSpeech(streamerId: string, text: string): void {
    const runtime = this.activeStreamers.get(streamerId);
    if (!runtime) {
      this.logger.warn(`No active runtime found for streamer ID ${streamerId}`);
      return;
    }

    runtime.queue.push(text);
    if (!runtime.isSpeaking) {
      this.processQueue(streamerId).catch((err: Error) => {
        this.logger.error(
          `Error processing speech queue for streamer ${streamerId}: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      });
    }
  }

  private async processQueue(streamerId: string): Promise<void> {
    const runtime = this.activeStreamers.get(streamerId);
    if (!runtime || runtime.isSpeaking) {
      return;
    }

    const text = runtime.queue.shift();
    if (!text) {
      return;
    }

    runtime.isSpeaking = true;
    try {
      await this.streamText(streamerId, text);
    } catch (err) {
      this.logger.error(
        `Error streaming text for streamer ${streamerId}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      runtime.isSpeaking = false;
      if (runtime.queue.length > 0) {
        this.processQueue(streamerId).catch((err: Error) => {
          this.logger.error(
            `Error processing speech queue for streamer ${streamerId}: ${err instanceof Error ? err.message : "Unknown error"}`,
          );
        });
      }
    }
  }

  async streamText(streamerId: string, text: string): Promise<void> {
    const runtime = this.activeStreamers.get(streamerId);
    if (!runtime) {
      this.logger.warn(`No active runtime found for streamer ID ${streamerId}`);
      return;
    }

    const streamer = await AIStreamer.findById(streamerId);
    if (!streamer || streamer.status !== "live") {
      this.logger.warn(`Streamer ${streamerId} is not live`);
      return;
    }

    try {
      const pcmBuffer = await TTSService.synthesizeForStreaming(text, {
        voice: streamer.voice,
      });
      await runtime.audioProducer.streamSegment(pcmBuffer);
      await AIStreamer.updateOne(
        { _id: streamerId },
        { lastSpokenAt: new Date() },
      );
      this.logger.info(`Streamed text for streamer ${streamerId}: "${text}"`);
    } catch (err: Error | any) {
      if (err.code === "EPIPE" || err.message?.includes("EPIPE")) {
        this.logger.warn(
          `EPIPE error while streaming text for streamer ${streamerId}: ${err.message}`,
        );
        await this.stopStreamer(streamerId);
      } else {
        this.logger.error(
          `Error streaming text for streamer ${streamerId}: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }
  }

  private async generateOpeningMonologue(
    streamer: IAIStreamer,
    runtime: RuntimeState,
  ): Promise<void> {
    try {
      const prompt = `You are a live streamer with this persona: "${streamer.persona}". 
You just went live and your topic is: "${streamer.topic}".
Write a short, energetic opening monologue (3-4 sentences). 
Speak directly to viewers. Do not use stage directions or quotes. Just the spoken words.`;

      const response = await GeminiService.generateRaw(prompt);
      this.enqueueSpeech(streamer.id, response);
    } catch (err) {
      this.logger.error("Opening monologue generation failed:", err);
      // Fallback so stream is not silent
      this.enqueueSpeech(
        streamer.id,
        `Hey everyone! Welcome to the stream. Today we're talking about ${streamer.topic}. Let's get into it!`,
      );
    }
  }

  private async generateChatResponse(
    streamer: IAIStreamer,
    username: string,
    message: string,
  ): Promise<string> {
    try {
      const prompt = `You are a live streamer with this persona: "${streamer.persona}".
Your stream topic is: "${streamer.topic}".
A viewer named "${username}" just said in chat: "${message}"
Respond naturally in 1-2 sentences. Speak directly. No stage directions, no quotes.`;

      return await GeminiService.generateRaw(prompt);
    } catch (err) {
      this.logger.error("Chat response generation failed:", err);
      return `Thanks for the message, ${username}!`;
    }
  }

  private async generateIdleFiller(streamer: IAIStreamer): Promise<string> {
    try {
      const prompt = `You are a live streamer with this persona: "${streamer.persona}".
Your stream topic is: "${streamer.topic}".
There's been a quiet moment. Say something interesting to fill the silence — a fact, opinion, or question for viewers.
1-2 sentences. Speak directly. No stage directions, no quotes.`;

      return await GeminiService.generateRaw(prompt);
    } catch (err) {
      this.logger.error("Idle filler generation failed:", err);
      return `Anyone have questions? Drop them in the chat!`;
    }
  }

  private resetIdleTimer(streamer: IAIStreamer, runtime: RuntimeState): void {
    if (runtime.idleTimer) clearTimeout(runtime.idleTimer);

    runtime.idleTimer = setTimeout(async () => {
      // Only fire if not currently speaking
      if (runtime.isSpeaking || runtime.queue.length > 0) {
        this.resetIdleTimer(streamer, runtime);
        return;
      }
      const text = await this.generateIdleFiller(streamer).catch(() => "");
      if (text) this.enqueueSpeech(streamer.id, text);
      this.resetIdleTimer(streamer, runtime);
    }, streamer.config.idlePromptIntervalMs);
  }

  getActiveStreamer(streamerId: string): RuntimeState | undefined {
    return this.activeStreamers.get(streamerId);
  }

  isActive(streamerId: string): boolean {
    return this.activeStreamers.has(streamerId);
  }
}

export default AIStreamerService;

import Vod from "@models/Vod";
import R2Service from "@services/R2Service";
import Logger from "@utils/logger";
import {
  ForbiddenError,
  normalizeError,
  NotFoundError,
  ValidationError,
} from "../types/error.types";
import type { Request, Response } from "express";
import path from "path";
import { promises as fs } from "fs";
import fixWebmDurationNode from "@utils/fixWebmDurationNode";
import { finalizedRecordings } from "@utils/recordingState";
import { Stream } from "../models/index";

const RECORDINGS_ROOT = "/tmp/recordings";
const RESOLVED_RECORDINGS_ROOT = path.resolve(RECORDINGS_ROOT);
const UPLOAD_TMP_ROOT = "/tmp";
const RESOLVED_UPLOAD_TMP_ROOT = path.resolve(UPLOAD_TMP_ROOT);
// Allowlist: UUID-timestamp only
const RECORDING_ID_RE =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-\d+$/i;

interface GetVodQuery {
  category?: string;
  userId?: string;
  limit?: string;
  skip?: string;
}

interface PopulatedUser {
  _id: string;
  username: string;
  avatar: string | null;
}

interface PopulatedVod {
  userId: PopulatedUser;
  [key: string]: any;
}

interface UploadChunkBody {
  streamId: string;
  recordingId: string;
  chunkIndex?: string;
}

interface RecordingEndBody {
  streamId: string;
  recordingId: string;
  durationMs?: number;
}

interface VodRequest extends Request {
  r2Service?: R2Service;
}

const generateAvatarUrl = (username: string): string => {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(username)}`;
};

const chunkBuffers = new Map<string, Map<number, Buffer>>(); // Map<recordingId, Map<chunkIndex, Buffer>>
const nextChunkIndex = new Map<string, number>(); // Map<recordingId, nextChunkIndex>

const VodController = {
  getVods: async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        category,
        userId,
        limit = "20",
        skip = "0",
      } = req.query as GetVodQuery;
      const query: any = { status: "ready" };

      if (typeof category === "string" && category.trim().length > 0) {
        query.category = { $eq: category.trim() };
      }
      if (typeof userId === "string" && userId.trim().length > 0) {
        query.userId = { $eq: userId.trim() };
      }

      // ✅ FIX: Validate numeric parameters
      const parsedSkip = Number.parseInt(skip, 10);
      const parsedLimit = Number.parseInt(limit, 10);
      const safeSkip =
        Number.isNaN(parsedSkip) || parsedSkip < 0 ? 0 : parsedSkip;
      const safeLimit =
        Number.isNaN(parsedLimit) || parsedLimit < 1 ? 20 : parsedLimit;

      const vods = await Vod.find(query)
        .sort({ createdAt: -1 })
        .skip(safeSkip)
        .limit(safeLimit)
        .populate("userId", "username avatar");

      const transformedVods = vods.map((vod) => {
        const vodObj = vod.toObject() as PopulatedVod;
        if (vodObj.userId && !vodObj.userId.avatar) {
          vodObj.userId.avatar = generateAvatarUrl(vodObj.userId.username);
        }
        return vodObj;
      });

      const total = await Vod.countDocuments(query);

      res.json({
        success: true,
        vods: transformedVods,
        total,
        pagination: {
          limit: safeLimit,
          skip: safeSkip,
          hasMore: safeSkip + vods.length < total,
        },
      });
    } catch (error) {
      Logger.error("Get VODs error:", error);
      const appError = normalizeError(error);
      res.status(appError.statusCode).json({
        success: false,
        error: {
          message: appError.message,
          code: appError.code,
          statusCode: appError.statusCode,
        },
      });
    }
  },

  getVodById: async (req: VodRequest, res: Response): Promise<void> => {
    try {
      const vod = await Vod.findById(req.params.id).populate(
        "userId",
        "username avatar",
      );
      if (!vod) throw new NotFoundError("VOD not found");

      const vodObj = vod.toObject() as PopulatedVod;
      if (vodObj.userId && !vodObj.userId.avatar) {
        vodObj.userId.avatar = generateAvatarUrl(vodObj.userId.username);
      }

      let playbackUrl: string | undefined;
      if (req.r2Service && vod.r2Key) {
        playbackUrl = await req.r2Service.getSignedUrl(vod.r2Key);
      }

      res.json({ success: true, vod: { ...vodObj, playbackUrl } });
    } catch (error) {
      const appError = normalizeError(error);
      Logger.error("Get VOD by ID error:", error);
      res.status(appError.statusCode).json({
        success: false,
        error: {
          message: appError.message,
          code: appError.code,
          statusCode: appError.statusCode,
        },
      });
    }
  },

  incrementView: async (req: Request, res: Response): Promise<void> => {
    try {
      const vod = await Vod.findByIdAndUpdate(
        req.params.id,
        { $inc: { views: 1 } },
        {
          new: true,
        },
      );

      if (!vod) {
        throw new NotFoundError("VOD not found");
      }
      res.json({
        success: true,
        message: "View count incremented",
        views: vod.views,
      });
    } catch (error) {
      Logger.error("Increment view error:", error);
      const appError = normalizeError(error);
      res.status(appError.statusCode).json({
        success: false,
        error: {
          message: appError.message,
          code: appError.code,
          statusCode: appError.statusCode,
        },
      });
    }
  },

  uploadChunk: async (req: Request, res: Response): Promise<void> => {
    try {
      const { streamId, recordingId } = req.body as UploadChunkBody;
      const chunk = req.file;

      if (!chunk || !streamId || !recordingId) {
        throw new ValidationError(
          "Missing required fields: chunk, streamId, recordingId",
        );
      }

      const stream = await Stream.findOne({
        id: streamId,
        userId: req.userId,
      });

      if (!stream) {
        throw new NotFoundError("Stream not found");
      }

      if (!RECORDING_ID_RE.test(recordingId)) {
        throw new ValidationError("Invalid recording format");
      }

      const filePath = path.resolve(RECORDINGS_ROOT, `${recordingId}.webm`);
      if (!filePath.startsWith(RESOLVED_RECORDINGS_ROOT + path.sep)) {
        throw new ValidationError("Invalid recording path");
      }

      const chunkIndex = parseInt(req.body.chunkIndex ?? '0', 10);
      if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
        throw new ValidationError("Invalid chunk index");
      }

      const resolvedChunkPath = path.resolve(chunk.path);
      if (
        resolvedChunkPath !== RESOLVED_UPLOAD_TMP_ROOT &&
        !resolvedChunkPath.startsWith(RESOLVED_UPLOAD_TMP_ROOT + path.sep)
      ) {
        throw new ValidationError("Invalid upload temp file path");
      }

      const realChunkPath = await fs.realpath(resolvedChunkPath);
      if (
        realChunkPath !== RESOLVED_UPLOAD_TMP_ROOT &&
        !realChunkPath.startsWith(RESOLVED_UPLOAD_TMP_ROOT + path.sep)
      ) {
        throw new ValidationError("Invalid upload temp file path");
      }

      const chunkStat = await fs.lstat(realChunkPath);
      if (!chunkStat.isFile()) {
        throw new ValidationError("Invalid upload temp file");
      }

      const chunkData = await fs.readFile(realChunkPath);
      await fs.unlink(realChunkPath); // Clean up the uploaded temp file

      if (!chunkBuffers.has(recordingId)) {
        chunkBuffers.set(recordingId, new Map());
        nextChunkIndex.set(recordingId, 0);
      }

      chunkBuffers.get(recordingId)!.set(chunkIndex, chunkData);
      let next = nextChunkIndex.get(recordingId)!;
      const buffer = chunkBuffers.get(recordingId)!;

      while(buffer.has(next)) {
        await fs.appendFile(filePath, buffer.get(next)!);
        buffer.delete(next);
        next++;
      }

      nextChunkIndex.set(recordingId, next);

      Logger.info(`Chunk uploaded for recording: ${recordingId}`);

      res.json({
        success: true,
        message: "Chunk uploaded successfully",
      });
    } catch (error) {
      Logger.error("Upload chunk error:", error);
      const appError = normalizeError(error);
      res.status(appError.statusCode).json({
        success: false,
        error: {
          message: appError.message,
          code: appError.code,
          statusCode: appError.statusCode,
        },
      });
    }
  },

  recordingEnd: async (req: Request, res: Response): Promise<void> => {
    try {
      const { streamId, recordingId, durationMs } =
        req.body as RecordingEndBody;

      if (!streamId || !recordingId) {
        throw new ValidationError(
          "Missing required fields: streamId, recordingId",
        );
      }

      if (typeof streamId !== "string") {
        throw new ValidationError("Invalid streamId format");
      }

      // ✅ FIX: Verify ownership
      const stream = await Stream.findOne({
        id: { $eq: streamId },
        userId: req.userId,
      });

      if (!stream) {
        throw new ForbiddenError("You don't own this stream");
      }

      if (!RECORDING_ID_RE.test(recordingId)) {
        throw new ValidationError("Invalid recording format");
      }

      const filePath = path.resolve(RECORDINGS_ROOT, `${recordingId}.webm`);
      if (!filePath.startsWith(RESOLVED_RECORDINGS_ROOT + path.sep)) {
        throw new ValidationError("Invalid recording path");
      }

      try {
        await fs.access(filePath);
      } catch (error) {
        res.json({
          success: true,
          message: "Recording not found, ignoring",
        });
        return;
      }

      const buffer = await fs.readFile(filePath);
      const fixedBuffer = await fixWebmDurationNode(buffer, durationMs || 0);

      await fs.writeFile(filePath, fixedBuffer);

      finalizedRecordings.add(recordingId);
      chunkBuffers.delete(recordingId);
      nextChunkIndex.delete(recordingId);

      Logger.info(`Recording finalized: ${recordingId}`);

      res.json({
        success: true,
        message: "Recording finalized successfully",
      });
    } catch (error) {
      Logger.error("Recording end error:", error);
      const appError = normalizeError(error);
      res.status(appError.statusCode).json({
        success: false,
        error: {
          message: appError.message,
          code: appError.code,
          statusCode: appError.statusCode,
        },
      });
    }
  },
};

export default VodController;

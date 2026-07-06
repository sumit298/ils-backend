import fs from "fs";
import type { Server as SocketIOServer } from "socket.io";
import type { Logger } from "winston";
import MediaService from "../services/MediaService";
import MessageQueue from "../services/MessageQueue";
import CacheService from "../services/CacheService";
import StreamService from "../services/StreamService";
import ChatService from "../services/ChatService";
import R2Service from "../services/R2Service";
import { connectDatabase } from "./db";
import MetricsService from "@services/MetricsService";
import AIStreamerService from "@services/AI/AIStreamerService";

export interface Services {
  mediaService: MediaService;
  messageQueue: MessageQueue;
  cacheService: CacheService;
  streamService: StreamService;
  chatService: ChatService;
  r2Service: R2Service;
  metricsService: MetricsService;
  aiStreamerService: AIStreamerService;
}

export async function initializeServices(
  io: SocketIOServer,
  logger: Logger,
): Promise<Services> {
  try {
    logger.info("Initializing services...");

    const metricsService = new MetricsService(logger);
    logger.info("MetricsService initialized");

    await connectDatabase(logger);

    const mediaService = new MediaService(logger);
    await mediaService.initialize();

    const messageQueue = new MessageQueue(logger);
    if (process.env.NODE_ENV === "development") {
      try {
        await messageQueue.connect();
      } catch (error) {
        logger.warn("RabbitMQ unavailable, continuing without it");
      }
    }

    const cacheService = new CacheService(logger);
    await cacheService.connect();

    const r2Service = new R2Service(logger);
    await fs.promises.mkdir("/tmp/recordings", { recursive: true });
    logger.info("R2 service and recordings directory initialized");

    const streamService = new StreamService(
      mediaService,
      messageQueue,
      cacheService,
      logger,
    );
    streamService.io = io;

    const chatService = new ChatService(messageQueue, cacheService, logger);

    logger.info("All services initialized successfully");

    return {
      mediaService,
      messageQueue,
      cacheService,
      streamService,
      chatService,
      r2Service,
      metricsService,
      aiStreamerService: new AIStreamerService(logger, mediaService),
    };
  } catch (error) {
    logger.error("Failed to initialize services:", error);
    throw error;
  }
}

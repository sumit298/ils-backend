import { Application } from "express";
import AuthMiddleware from "@middleware/auth.middleware";
import authRoutes from "./auth.routes";
import streamRoutes from "./stream.routes";
import chatRoutes from "./chat.routes";
import followRoutes from "./follow.routes";
import notificationRoutes from "./notification.routes";
import vodRoutes from "./vod.routes";
import metricsRoutes from "./metrics.routes";
import aiPodcastRoutes from "./ai-podcast.routes";
import createAIStreamerRoutes from "./ai-streamer.routes";
import type StreamService from "@services/StreamService";
import type ChatService from "@services/ChatService";
import type CacheService from "@services/CacheService";
import type R2Service from "@services/R2Service";
import type MediaService from "@services/MediaService";
import Logger from "@utils/logger";

interface RegisterRoutesOptions {
  streamService: StreamService;
  chatService: ChatService;
  cacheService: CacheService;
  r2Service: R2Service;
  mediaService: MediaService;
}

export const registerRoutes = (
  app: Application,
  services: RegisterRoutesOptions,
): void => {
  const { streamService, chatService, cacheService, r2Service, mediaService } = services;

  // Metrics endpoint (no auth required, for Prometheus scraping)
  app.use("/metrics", metricsRoutes);

  // Auth routes
  app.use(
    "/api/auth",
    (req: any, res, next) => {
      req.r2Service = r2Service;
      req.cacheService = cacheService;
      next();
    },
    authRoutes,
  );

  // Stream routes
  app.use("/api/streams", streamRoutes(streamService, cacheService));

  // Chat routes
  app.use("/api/chat", AuthMiddleware.authenticate, chatRoutes(chatService));

  // Follow routes
  app.use("/api/users", followRoutes);

  // Notification routes
  app.use(
    "/api/notifications",
    AuthMiddleware.authenticate,
    notificationRoutes,
  );

  // VOD routes
  app.use(
    "/api/vods",
    (req: any, res, next) => {
      req.r2Service = r2Service;
      req.logger = Logger;
      next();
    },
    vodRoutes,
  );

  // AI Podcast routes
  app.use("/api/ai-podcast", aiPodcastRoutes);

  // AI Streamer routes
  app.use("/api/ai-streamer", createAIStreamerRoutes({ mediaService, logger: Logger }));

  Logger.info("All routes registered successfully");
};

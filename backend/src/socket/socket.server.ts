import { Server as SocketIOServer } from 'socket.io';
import AuthMiddleWare from '@middleware/auth.middleware';
import logger from '@utils/logger';
import { registerWebRTCHandlers } from './handlers/webrtc.handler';
import { registerStreamHandlers } from './handlers/stream.handler';
import { registerChatHandlers } from './handlers/chat.handler';
import { registerRecordingHandlers } from './handlers/recording.handler';
import type { AuthenticatedSocket } from '../types/socket.types';
import type MediaService from '../services/MediaService';
import type StreamService from '../services/StreamService';
import type ChatService from '../services/ChatService';
import type R2Service from '../services/R2Service';
import type MessageQueue from '../services/MessageQueue';
import type AIStreamerService from '../services/AI/AIStreamerService';
import type MetricsService from '../services/MetricsService';
import fs from 'fs';

interface Services {
  mediaService: MediaService;
  streamService: StreamService;
  chatService: ChatService;
  r2Service: R2Service;
  messageQueue: MessageQueue;
  aiStreamerService: AIStreamerService;
  metricsService: MetricsService;
}

interface ActiveConnection {
  userId: string;
  connectedAt: number;
}

interface RateLimit {
  count: number;
  resetAt: number;
}

export function initializeSocketHandlers(
  io: SocketIOServer,
  services: Services,
): void {
  // Apply authentication middleware
  io.use(AuthMiddleWare.socketAuth);
  
  // Error handling middleware
  io.use((socket, next) => {
    socket.on('error', (error) => {
      logger.error(`Socket error: ${error}`);
    });
    next();
  });

  // Shared state for handlers
  const activeConnections = new Map<string, ActiveConnection>();
  const recordingStreams = new Map<string, fs.WriteStream>();
  const chatRateLimits = new Map<string, RateLimit>();

  // Handle new connections
  io.on('connection', (socket) => {
    // Cast to AuthenticatedSocket after authentication middleware
    const authSocket = socket as unknown as AuthenticatedSocket;
    
    logger.info(`Client connected: ${authSocket.id}, User: ${authSocket.userId}`);

    const userId = authSocket.userId || authSocket.user?._id;

    // Join user notification room
    if (userId) {
      authSocket.join(`user:${userId.toString()}`);
      logger.info(`User ${userId} joined notification room: user:${userId}`);
    }

    // Track active connection
    activeConnections.set(authSocket.id, {
      userId: authSocket.userId,
      connectedAt: Date.now(),
    });

    // Register all event handlers
    registerWebRTCHandlers(authSocket, {
      mediaService: services.mediaService,
      streamService: services.streamService,
      logger,
    });

    registerStreamHandlers(authSocket, {
      mediaService: services.mediaService,
      streamService: services.streamService,
      logger,
    }, io, activeConnections);

    registerChatHandlers(authSocket, {
      chatService: services.chatService,
      logger,
      aiStreamerService: services.aiStreamerService,
    }, io, chatRateLimits);

    registerRecordingHandlers(authSocket, {
      r2Service: services.r2Service,
      messageQueue: services.messageQueue,
      logger,
    }, recordingStreams, io);

    // Global error handler
    authSocket.on('error', (error) => {
      logger.error(`Socket error for ${authSocket.id}: ${error}`);
    });
  });

  logger.info('Socket.IO handlers initialized');
}

import type { Server as SocketIOServer } from "socket.io";
import type { Logger } from "winston";
import ChatService from "@services/ChatService";
import { Stream, User, Notification } from "@models/index";
import { incrementChatMessages } from "@utils/streamStats";
import { AuthenticatedSocket } from "@appTypes/socket.types";
import AIStreamer from "@models/AIStreamer";
import type AIStreamerService from "@services/AI/AIStreamerService";

interface Services {
  chatService: ChatService;
  logger: Logger;
  aiStreamerService: AIStreamerService;
}

interface JoinChatData {
  streamId: string;
}

interface SendMessageData {
  roomId: string;
  content: string;
  type?: string;
}

interface ModActionData {
  streamId: string;
  action: string;
  target: string;
  duration?: number;
}

interface SlowModeData {
  streamId: string;
  seconds: number;
}

interface UnbanUserData {
  streamId: string;
  target: string;
}

interface DeleteMessageData {
  streamId: string;
  messageId: string;
}

interface AnnounceData {
  streamId: string;
  message: string;
}

interface RateLimit {
  count: number;
  resetAt: number;
}

export function registerChatHandlers(
  socket: AuthenticatedSocket,
  services: Services,
  io: SocketIOServer,
  chatRateLimits: Map<string, RateLimit>,
): void {
  const { chatService, logger } = services;

  socket.on(
    "join-chat",
    (data: JoinChatData, callback?: (result: unknown) => void) => {
      const { streamId } = data;
      if (!streamId) {
        return callback?.({ error: "Stream ID is required" });
      }

      socket.join(`room:${streamId}`);
      callback?.({ success: true });
    },
  );

  socket.on(
    "send-message",
    async (data: SendMessageData, callback?: (result: unknown) => void) => {
      try {
        if (!data?.roomId || !data?.content || data?.content.length > 500) {
          return callback?.({ error: "Invalid message data" });
        }

        const isTimedOut = await chatService.isUserTimedOut(socket.userId);

        if (isTimedOut) {
          return callback?.({ error: "You are timed out from chat" });
        }

        // Rate Limit: max 5 messages per 3 seconds per user
        const now = Date.now();
        const limit = chatRateLimits.get(socket.userId) || {
          count: 0,
          resetAt: now + 3000,
        };

        if (now > limit.resetAt) {
          limit.count = 0;
          limit.resetAt = now + 3000;
        }
        limit.count++;
        chatRateLimits.set(socket.userId, limit);

        if (limit.count > 5) {
          return callback?.({
            error: "You are sending messages too quickly. Please slow down.",
          });
        }

        // Get username from socket.data or socket.user
        const username =
          socket.data?.username || socket.user?.username || "Anonymous";

        logger.info(
          `[CHAT] Sending message - userId: ${socket.userId}, username from socket.data: ${socket.data?.username}, username from socket.user: ${socket.user?.username}, final username: ${username}`,
        );

        const message = await chatService.sendMessage(
          socket.userId,
          data.roomId,
          data.content,
          data.type || "text",
          username,
        );

        incrementChatMessages(data.roomId).catch((error) =>
          logger.error("Error incrementing chat messages", error),
        );

        if (!data?.roomId || !data?.content || data?.content.length > 500) {
          return callback?.({ error: "Invalid message parameters" });
        }

        if (message.mentions?.length > 0) {
          logger.info(`Processing ${message.mentions.length} mentions`);
          for (const mentionedUserId of message.mentions) {
            logger.info(`Creating notification for user: ${mentionedUserId}`);
            const notification = await Notification.create({
              userId: mentionedUserId,
              type: "chat-mention",
              title: "New Mention",
              message: `${username} mentioned you`,
              data: { streamId: data.roomId },
            });
            logger.info(`Emitting notification to user-${mentionedUserId}`);
            io.to(`user:${mentionedUserId}`).emit("notification", notification);
          }
        }
        io.to(`room:${data.roomId}`).emit("new-message", message);

        // Forward chat to any active AI streamer in this room
        if (services.aiStreamerService) {
          const aiStreamer = await AIStreamer.findOne({
            streamId: data.roomId,
            status: "live",
          });
          if (aiStreamer) {
            services.aiStreamerService
              .handleChatMessage(aiStreamer.id, username, data.content)
              .catch((err) => logger.error("AI chat handler error:", err));
          }
        }
      } catch (error) {
        const err = error as Error;
        logger.error("Send message error", error);
        callback?.({ error: err.message });
      }
    },
  );

  // mod action
  socket.on("mod-action", async (data: ModActionData) => {
    try {
      const { streamId, action, target, duration } = data;
      if (!streamId || !action || !target) return;

      // check if sender is the streamer
      const stream = await Stream.findOne({ id: streamId });
      if (!stream || stream.userId.toString() !== socket.userId) return;

      const targetUser = await User.findOne({ username: target });
      if (!targetUser) return;

      // Prevent streamer from banning themselves
      if (targetUser._id.toString() === socket.userId) return;

      // Check if cache service is available
      if (!chatService.cacheService?.client) {
        logger.warn("Cache service not available for slow mode");
        return;
      }

      if (action === "timeout") {
        const seconds = duration || 300;
        await chatService.cacheService.client.setex(
          `timeout:user:${targetUser._id}`,
          seconds,
          "true",
        );
        io.to(`room:${streamId}`).emit("new-message", {
          id: Date.now().toString(),
          userId: "system",
          username: "System",
          content: `${target} has been timed out for ${seconds} seconds`,
          timestamp: new Date().toISOString(),
          type: "system",
        });
      } else if (action === "ban") {
        await chatService.cacheService.client.setex(
          `timeout:user:${targetUser._id}`,
          3600, // 1 hour
          "true",
        );
        io.to(`room:${streamId}`).emit("new-message", {
          id: Date.now().toString(),
          userId: "system",
          username: "System",
          content: `${target} has been banned from chat`,
          timestamp: new Date().toISOString(),
          type: "system",
        });
      }
    } catch (error) {
      logger.error("Mod action error:", error);
    }
  });

  // Slow mode
  socket.on("slow-mode", async (data: SlowModeData) => {
    try {
      const { streamId, seconds } = data;
      if (!streamId) return;

      const stream = await Stream.findOne({ id: streamId });
      if (!stream || stream.userId.toString() !== socket.userId) return;

      // Check if cache service is available
      if (!chatService.cacheService?.client) {
        logger.warn("Cache service not available for slow mode");
        return;
      }

      if (seconds > 0) {
        await chatService.cacheService.client.setex(
          `slowmode:${streamId}`,
          86400,
          seconds.toString(),
        );
        io.to(`room:${streamId}`).emit("new-message", {
          id: Date.now().toString(),
          userId: "system",
          username: "System",
          content: `Slow mode enabled: ${seconds}s between messages`,
          timestamp: new Date().toISOString(),
          type: "system",
        });
      } else {
        await chatService.cacheService.client.del(`slowmode:${streamId}`);
        io.to(`room:${streamId}`).emit("new-message", {
          id: Date.now().toString(),
          userId: "system",
          username: "System",
          content: `Slow mode disabled`,
          timestamp: new Date().toISOString(),
          type: "system",
        });
      }
    } catch (error) {
      logger.error("Slow mode error:", error);
    }
  });

  // Unban user
  socket.on("unban-user", async (data: UnbanUserData) => {
    try {
      const { streamId, target } = data;
      if (!streamId || !target) return;

      const stream = await Stream.findOne({ id: streamId });
      if (!stream || stream.userId.toString() !== socket.userId) return;

      const targetUser = await User.findOne({ username: target });
      if (!targetUser) return;

      // Check if cache service is available
      if (!chatService.cacheService?.client) {
        logger.warn("Cache service not available for slow mode");
        return;
      }

      const removed = await chatService.cacheService.client.del(
        `timeout:user:${targetUser._id}`,
      );

      io.to(`room:${streamId}`).emit("new-message", {
        id: Date.now().toString(),
        userId: "system",
        username: "System",
        content: removed
          ? `${target} has been unbanned`
          : `${target} is not banned`,
        timestamp: new Date().toISOString(),
        type: "system",
      });
    } catch (error) {
      logger.error("Unban error:", error);
    }
  });

  // Delete message
  socket.on("delete-message", async (data: DeleteMessageData) => {
    try {
      const { streamId, messageId } = data;
      if (!streamId || !messageId) return;

      const stream = await Stream.findOne({ id: streamId });
      if (!stream || stream.userId.toString() !== socket.userId) return;

      io.to(`stream:${streamId}`).emit("message-deleted", { messageId });
    } catch (error) {
      logger.error("Delete message error:", error);
    }
  });

  // Announce
  socket.on("announce", async (data: AnnounceData) => {
    try {
      const { streamId, message } = data;
      if (!streamId || !message) return;

      const stream = await Stream.findOne({ id: streamId });
      if (!stream || stream.userId.toString() !== socket.userId) return;

      io.to(`room:${streamId}`).emit("new-message", {
        id: Date.now().toString(),
        userId: "system",
        username: "Announcement",
        content: message,
        timestamp: new Date().toISOString(),
        type: "announce",
      });
    } catch (error) {
      logger.error("Announce error:", error);
    }
  });
}

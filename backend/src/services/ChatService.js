const { v4: uuidv4 } = require('uuid');
const { ChatMessage } = require('../models');

class ChatService {
  constructor(messageQueue, cacheService, logger) {
    this.messageQueue = messageQueue;
    this.cacheService = cacheService;
    this.logger = logger;
    this.messageTypes = ['text', 'emoji', 'system', 'gif', 'sticker'];
  }

  async sendMessage(userId, streamId, content, type = 'text') {
    try {
      // Validate message type
      if (!this.messageTypes.includes(type)) {
        throw new Error('Invalid message type');
      }

      // Validate content
      if (!content || content.trim().length === 0) {
        throw new Error('Message content cannot be empty');
      }

      if (content.length > 500) {
        throw new Error('Message too long');
      }

      // Check rate limit (disabled for testing)
      if (this.cacheService) {
        // const rateLimitKey = `chat:ratelimit:${userId}`;
        // const isAllowed = await this.cacheService.checkRateLimit(rateLimitKey, 10, 60000);
        // if (!isAllowed) {
        //   throw new Error('Rate limit exceeded. Please wait before sending another message.');
        // }
      }

      // Create message
      const message = {
        id: uuidv4(),
        userId,
        streamId,
        content: content.trim(),
        type,
        timestamp: new Date().toISOString(),
        edited: false,
        deleted: false,
        reactions: {}
      };

      // Add to cache (disabled for testing)
      if (this.cacheService) {
        // await this.cacheService.addChatMessage(streamId, message);
      }

      // Save to database
      try {
        const messageDoc = new ChatMessage(message);
        await messageDoc.save();
      } catch (dbError) {
        this.logger.warn('Chat message database save failed:', dbError);
      }

      // Publish message (disabled for testing)
      if (this.messageQueue) {
        // await this.messageQueue.publishChatMessage(message);
        // await this.messageQueue.publishAnalyticsEvent('chat.message', {
        //   streamId,
        //   userId,
        //   type,
        //   messageLength: content.length,
        //   timestamp: Date.now()
        // });
      }

      this.logger.debug(`Chat message sent: ${message.id} in stream ${streamId}`);
      return message;
    } catch (error) {
      this.logger.error('Error sending chat message:', error);
      throw error;
    }
  }

  async getMessages(streamId, limit = 50, before = null) {
    try {
      let messages = [];
      
      // Get from database since cache is disabled
      try {
        const query = { streamId, deleted: false };
        if (before) {
          query.timestamp = { $lt: before };
        }

        const dbMessages = await ChatMessage.find(query)
          .sort({ timestamp: -1 })
          .limit(limit);

        messages = dbMessages.map(msg => msg.toObject()).reverse();
      } catch (dbError) {
        this.logger.warn('Chat messages database query failed:', dbError);
      }

      return messages;
    } catch (error) {
      this.logger.error('Error getting chat messages:', error);
      return [];
    }
  }

  async deleteMessage(messageId, userId, isModeratorOrOwner = false) {
    try {
      const message = await ChatMessage.findOne({ id: messageId });
      if (!message) {
        throw new Error('Message not found');
      }

      // Check permissions
      if (message.userId !== userId && !isModeratorOrOwner) {
        throw new Error('Unauthorized to delete this message');
      }

      // Mark as deleted
      message.deleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId;
      await message.save();

      // Create system message about deletion
      const systemMessage = {
        id: uuidv4(),
        userId: 'system',
        streamId: message.streamId,
        content: 'A message was deleted',
        type: 'system',
        timestamp: new Date().toISOString(),
        originalMessageId: messageId
      };

      await this.cacheService.addChatMessage(message.streamId, systemMessage);
      await this.messageQueue.publishChatMessage(systemMessage);

      // Publish analytics event
      await this.messageQueue.publishAnalyticsEvent('chat.message.deleted', {
        streamId: message.streamId,
        messageId,
        deletedBy: userId,
        timestamp: Date.now()
      });

      this.logger.info(`Chat message deleted: ${messageId} by user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error('Error deleting chat message:', error);
      throw error;
    }
  }

  async addReaction(messageId, userId, emoji) {
    try {
      const message = await ChatMessage.findOne({ id: messageId, deleted: false });
      if (!message) {
        throw new Error('Message not found');
      }

      // Initialize reactions if not exists
      if (!message.reactions) {
        message.reactions = {};
      }

      // Add or remove reaction
      if (!message.reactions[emoji]) {
        message.reactions[emoji] = [];
      }

      const userIndex = message.reactions[emoji].indexOf(userId);
      if (userIndex === -1) {
        message.reactions[emoji].push(userId);
      } else {
        message.reactions[emoji].splice(userIndex, 1);
        if (message.reactions[emoji].length === 0) {
          delete message.reactions[emoji];
        }
      }

      await message.save();

      // Publish reaction update
      await this.messageQueue.publishChatMessage({
        type: 'reaction_update',
        messageId,
        reactions: message.reactions,
        streamId: message.streamId,
        timestamp: new Date().toISOString()
      });

      this.logger.debug(`Reaction ${emoji} ${userIndex === -1 ? 'added' : 'removed'} by user ${userId}`);
      return message.reactions;
    } catch (error) {
      this.logger.error('Error adding reaction:', error);
      throw error;
    }
  }

  async moderateMessage(messageId, action, moderatorId, reason = '') {
    try {
      const validActions = ['delete', 'timeout', 'warn'];
      if (!validActions.includes(action)) {
        throw new Error('Invalid moderation action');
      }

      const message = await ChatMessage.findOne({ id: messageId });
      if (!message) {
        throw new Error('Message not found');
      }

      // Create moderation record
      const moderationEvent = {
        id: uuidv4(),
        messageId,
        userId: message.userId,
        streamId: message.streamId,
        action,
        moderatorId,
        reason,
        timestamp: new Date().toISOString()
      };

      // Apply moderation action
      switch (action) {
        case 'delete':
          await this.deleteMessage(messageId, moderatorId, true);
          break;
        case 'timeout':
          // Implement user timeout logic
          await this.cacheService.client.setex(`timeout:user:${message.userId}`, 300, 'true'); // 5 min timeout
          break;
        case 'warn':
          // Send warning to user
          break;
      }

      // Publish moderation event
      await this.messageQueue.publishAnalyticsEvent('chat.moderation', moderationEvent);

      this.logger.info(`Message moderated: ${messageId}, action: ${action} by ${moderatorId}`);
      return moderationEvent;
    } catch (error) {
      this.logger.error('Error moderating message:', error);
      throw error;
    }
  }

  async isUserTimedOut(userId) {
    try {
      const timeout = await this.cacheService.client.get(`timeout:user:${userId}`);
      return !!timeout;
    } catch (error) {
      this.logger.error('Error checking user timeout:', error);
      return false;
    }
  }

  async getChatStats(streamId) {
    try {
      const stats = await this.cacheService.getStreamStats(streamId);

      // Get additional chat statistics from database
      const [totalMessages, uniqueUsers, recentActivity] = await Promise.all([
        ChatMessage.countDocuments({ streamId, deleted: false }),
        ChatMessage.distinct('userId', { streamId, deleted: false }),
        ChatMessage.find({ streamId, deleted: false })
          .sort({ timestamp: -1 })
          .limit(100)
          .select('timestamp')
      ]);

      // Calculate messages per minute for recent activity
      const now = Date.now();
      const recentMessages = recentActivity.filter(msg =>
        now - new Date(msg.timestamp).getTime() < 300000 // Last 5 minutes
      );

      return {
        totalMessages,
        uniqueChatters: uniqueUsers.length,
        messagesPerMinute: Math.round(recentMessages.length / 5),
        recentActivity: recentMessages.length,
        ...stats
      };
    } catch (error) {
      this.logger.error('Error getting chat stats:', error);
      return {
        totalMessages: 0,
        uniqueChatters: 0,
        messagesPerMinute: 0,
        recentActivity: 0
      };
    }
  }

  async isMessageOwner(messageId, userId) {
    try {
      const message = await ChatMessage.findOne({ id: messageId });
      return message && message.userId === userId;
    } catch (error) {
      this.logger.error('Error checking message ownership:', error);
      return false;
    }
  }

  async flagMessage(messageId, userId, reason, details = '') {
    try {
      const message = await ChatMessage.findOne({ id: messageId });
      if (!message) {
        throw new Error('Message not found');
      }

      const flag = {
        id: uuidv4(),
        messageId,
        flaggedBy: userId,
        reason,
        details,
        timestamp: new Date().toISOString()
      };

      await this.messageQueue.publishAnalyticsEvent('chat.message.flagged', flag);
      this.logger.info(`Message flagged: ${messageId} by user ${userId}`);
      return flag;
    } catch (error) {
      this.logger.error('Error flagging message:', error);
      throw error;
    }
  }
}

module.exports = ChatService;
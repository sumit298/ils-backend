
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const AuthMiddleWare = require('../middleware/middleware.auth');

module.exports = (chatService, logger) => {
    const router = express.Router();

    // Rate limiting for chat operations
    const chatLimiter = rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 30, // 30 messages per minute per user
        message: { error: 'Too many messages. Please slow down.' },
        keyGenerator: (req) => req.userId,
        standardHeaders: true,
        legacyHeaders: false,
    });

    const chatQueryLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 200, // 200 requests per 15 minutes
        message: { error: 'Too many requests. Please slow down.' }
    });

    // Validation rules
    const sendMessageValidation = [
        param('streamId').notEmpty().withMessage('Stream ID is required'),
        body('content')
            .trim()
            .isLength({ min: 1, max: 500 })
            .withMessage('Message content must be between 1 and 500 characters'),
        body('type')
            .optional()
            .isIn(['text', 'emoji', 'gif', 'sticker'])
            .withMessage('Invalid message type'),
        body('responseToMessageId')
            .optional()
            .isUUID()
            .withMessage('Invalid message ID for response')
    ];

    const getMessagesValidation = [
        param('streamId').notEmpty().withMessage('Stream ID is required'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('before')
            .optional()
            .isISO8601()
            .withMessage('Invalid date format for before parameter')
    ];

    const moderationValidation = [
        param('streamId').notEmpty().withMessage('Stream ID is required'),
        param('messageId').isUUID().withMessage('Invalid message ID'),
        body('action')
            .isIn(['delete', 'timeout', 'warn'])
            .withMessage('Invalid moderation action'),
        body('reason')
            .optional()
            .trim()
            .isLength({ max: 200 })
            .withMessage('Reason must be less than 200 characters')
    ];

    // GET /api/chat/:streamId - Get chat messages for a stream
    router.get('/:streamId', chatQueryLimiter, getMessagesValidation, async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { streamId } = req.params;
            const { limit = 50, before } = req.query;

            // Check if user can access this stream's chat
            // This would typically involve checking stream permissions
            // For now, we'll assume all authenticated users can read chat

            const messages = await chatService.getMessages(
                streamId,
                parseInt(limit),
                before ? new Date(before) : null
            );

            // Filter out deleted messages unless user is moderator/admin
            const filteredMessages = messages.map(message => {
                if (message.deleted && (!req.user || (req.user.role !== 'admin' && req.user.role !== 'moderator'))) {
                    return {
                        ...message.getSafeMessage(),
                        content: '[Message deleted]'
                    };
                }
                return message.getSafeMessage ? message.getSafeMessage() : message;
            });

            res.json({
                success: true,
                messages: filteredMessages,
                total: filteredMessages.length,
                hasMore: filteredMessages.length === parseInt(limit)
            });

        } catch (error) {
            logger.error('Get chat messages error:', error);
            res.status(500).json({
                error: 'Failed to fetch chat messages',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });

    // POST /api/chat/:streamId - Send a chat message
    router.post('/:streamId', chatLimiter, sendMessageValidation, async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { streamId } = req.params;
            const { content, type = 'text', responseToMessageId } = req.body;

            // Check if user is timed out
            const isTimedOut = await chatService.isUserTimedOut(req.userId);
            if (isTimedOut) {
                return res.status(403).json({
                    error: 'You are currently timed out and cannot send messages.'
                });
            }

            // Create message object with metadata
            const messageData = {
                content,
                type,
                responseToMessageId,
                metadata: {
                    userAgent: req.headers['user-agent'],
                    ipAddress: req.ip, // This will be hashed in the service
                    device: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop'
                }
            };

            const message = await chatService.sendMessage(
                req.userId,
                streamId,
                messageData.content,
                messageData.type
            );

            res.status(201).json({
                success: true,
                message: 'Message sent successfully',
                data: message.getSafeMessage ? message.getSafeMessage() : message
            });

        } catch (error) {
            logger.error('Send chat message error:', error);

            if (error.message.includes('Rate limit')) {
                return res.status(429).json({ error: error.message });
            }
            if (error.message.includes('spam')) {
                return res.status(400).json({ error: 'Message flagged as spam' });
            }

            res.status(500).json({
                error: 'Failed to send message',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });

    // DELETE /api/chat/:streamId/:messageId - Delete a chat message
    router.delete('/:streamId/:messageId', [
        param('streamId').notEmpty().withMessage('Stream ID is required'),
        param('messageId').isUUID().withMessage('Invalid message ID')
    ], async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { streamId, messageId } = req.params;

            // Check if user is moderator, admin, or message owner
            const isModeratorOrOwner = req.user.role === 'admin' ||
                req.user.role === 'moderator' ||
                await chatService.isMessageOwner(messageId, req.userId);

            const result = await chatService.deleteMessage(messageId, req.userId, isModeratorOrOwner);

            if (result) {
                res.json({
                    success: true,
                    message: 'Message deleted successfully'
                });
            } else {
                res.status(404).json({
                    error: 'Message not found or already deleted'
                });
            }

        } catch (error) {
            logger.error('Delete chat message error:', error);

            if (error.message.includes('Unauthorized')) {
                return res.status(403).json({ error: 'Access denied' });
            }
            if (error.message.includes('not found')) {
                return res.status(404).json({ error: 'Message not found' });
            }

            res.status(500).json({
                error: 'Failed to delete message',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });

    // POST /api/chat/:streamId/:messageId/react - Add reaction to message
    router.post('/:streamId/:messageId/react', [
        param('streamId').notEmpty().withMessage('Stream ID is required'),
        param('messageId').isUUID().withMessage('Invalid message ID'),
        body('emoji')
            .trim()
            .isLength({ min: 1, max: 10 })
            .withMessage('Emoji must be between 1 and 10 characters')
    ], async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { messageId } = req.params;
            const { emoji } = req.body;

            const reactions = await chatService.addReaction(messageId, req.userId, emoji);

            res.json({
                success: true,
                message: 'Reaction updated successfully',
                reactions: reactions
            });

        } catch (error) {
            logger.error('Add reaction error:', error);

            if (error.message.includes('not found')) {
                return res.status(404).json({ error: 'Message not found' });
            }

            res.status(500).json({
                error: 'Failed to add reaction',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });


// POST /api/chat/:streamId/:messageId/moderate - Moderate a message
router.post('/:streamId/:messageId/moderate',
    AuthMiddleWare.requiredRoles(['moderator', 'admin']),
    moderationValidation,
        async (req, res) => {
            try {
                const errors = validationResult(req);
                if (!errors.isEmpty()) {
                    return res.status(400).json({
                        error: 'Validation failed',
                        details: errors.array()
                    });
                }

                const { messageId } = req.params;
                const { action, reason = '' } = req.body;

                const moderationResult = await chatService.moderateMessage(
                    messageId,
                    action,
                    req.userId,
                    reason
                );

                logger.info(`Message moderated: ${messageId}, action: ${action}, by: ${req.userId}`);

                res.json({
                    success: true,
                    message: `Message ${action} successfully`,
                    moderation: moderationResult
                });

            } catch (error) {
                logger.error('Moderate message error:', error);

                if (error.message.includes('not found')) {
                    return res.status(404).json({ error: 'Message not found' });
                }

                res.status(500).json({
                    error: 'Failed to moderate message',
                    message: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    );

    // GET /api/chat/:streamId/stats - Get chat statistics
    router.get('/:streamId/stats', chatQueryLimiter, [
        param('streamId').notEmpty().withMessage('Stream ID is required')
    ], async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { streamId } = req.params;
            const stats = await chatService.getChatStats(streamId);

            res.json({
                success: true,
                stats: stats
            });

        } catch (error) {
            logger.error('Get chat stats error:', error);
            res.status(500).json({
                error: 'Failed to fetch chat statistics',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });

    // POST /api/chat/:streamId/:messageId/flag - Flag a message for moderation
    router.post('/:streamId/:messageId/flag', [
        param('streamId').notEmpty().withMessage('Stream ID is required'),
        param('messageId').isUUID().withMessage('Invalid message ID'),
        body('reason')
            .isIn(['spam', 'inappropriate', 'harassment', 'off-topic', 'other'])
            .withMessage('Invalid flag reason'),
        body('details')
            .optional()
            .trim()
            .isLength({ max: 200 })
            .withMessage('Details must be less than 200 characters')
    ], async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { messageId } = req.params;
            const { reason, details = '' } = req.body;

            const result = await chatService.flagMessage(messageId, req.userId, reason, details);

            res.json({
                success: true,
                message: 'Message flagged successfully',
                flagId: result.id
            });

        } catch (error) {
            logger.error('Flag message error:', error);

            if (error.message.includes('already flagged')) {
                return res.status(409).json({ error: 'Message already flagged by you' });
            }
            if (error.message.includes('not found')) {
                return res.status(404).json({ error: 'Message not found' });
            }

            res.status(500).json({
                error: 'Failed to flag message',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });

    return router;
};
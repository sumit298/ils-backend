const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

module.exports = (streamService, logger) => {
  const router = express.Router();

  // Rate limiting for stream operations
  const streamCreateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 streams per hour per user
    message: { error: 'Too many streams created. Please wait before creating another.' },
    keyGenerator: (req) => req.userId, // Rate limit per user
    standardHeaders: true,
    legacyHeaders: false,
  });

  const streamQueryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: { error: 'Too many requests. Please slow down.' }
  });

  // Validation rules
  const createStreamValidation = [
    body('title')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Title must be between 1 and 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('category')
      .optional()
      .isIn(['gaming', 'music', 'art', 'technology', 'education', 'entertainment', 'sports', 'general'])
      .withMessage('Invalid category'),
    body('isPrivate')
      .optional()
      .isBoolean()
      .withMessage('isPrivate must be a boolean'),
    body('chatEnabled')
      .optional()
      .isBoolean()
      .withMessage('chatEnabled must be a boolean'),
    body('recordingEnabled')
      .optional()
      .isBoolean()
      .withMessage('recordingEnabled must be a boolean'),
    body('tags')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Maximum 10 tags allowed'),
    body('tags.*')
      .optional()
      .trim()
      .isLength({ min: 1, max: 30 })
      .withMessage('Each tag must be between 1 and 30 characters')
  ];

  const updateStreamValidation = [
    param('id').isUUID().withMessage('Invalid stream ID'),
    body('title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Title must be between 1 and 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('category')
      .optional()
      .isIn(['gaming', 'music', 'art', 'technology', 'education', 'entertainment', 'sports', 'general'])
      .withMessage('Invalid category')
  ];

  // GET /api/streams - Get all active streams with filtering
  router.get('/', streamQueryLimiter, [
    query('category').optional().isIn(['gaming', 'music', 'art', 'technology', 'education', 'entertainment', 'sports', 'general']),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
    query('search').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Search query must be between 2 and 100 characters'),
    query('sortBy').optional().isIn(['viewers', 'created', 'title']).withMessage('Invalid sort parameter')
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const {
        category,
        limit = 20,
        offset = 0,
        search,
        sortBy = 'viewers'
      } = req.query;

      let streams;

      if (search) {
        // Use search functionality
        streams = await streamService.searchStreams(search, parseInt(limit));
      } else {
        // Get active streams with filtering
        streams = await streamService.getActiveStreams({
          category,
          limit: parseInt(limit),
          offset: parseInt(offset),
          sortBy
        });
      }

      // Filter out private streams the user can't access
      const accessibleStreams = streams.filter(stream => {
        if (!stream.isPrivate) return true;
        if (stream.userId === req.userId) return true;
        return stream.settings?.allowedViewers?.includes(req.userId);
      });

      res.json({
        success: true,
        streams: accessibleStreams,
        total: accessibleStreams.length,
        hasMore: accessibleStreams.length === parseInt(limit)
      });

    } catch (error) {
      logger.error('Get streams error:', error);
      res.status(500).json({
        error: 'Failed to fetch streams',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // POST /api/streams - Create a new stream
  router.post('/', streamCreateLimiter, createStreamValidation, async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      // Check if user already has an active stream
      const userActiveStreams = await streamService.getUserActiveStreams(req.userId);
      if (userActiveStreams.length > 0) {
        return res.status(409).json({
          error: 'You already have an active stream. Please end your current stream before starting a new one.'
        });
      }

      const streamData = {
        title: req.body.title,
        description: req.body.description || '',
        category: req.body.category || 'general',
        isPrivate: req.body.isPrivate || false,
        chatEnabled: req.body.chatEnabled !== false,
        recordingEnabled: req.body.recordingEnabled || false,
        tags: req.body.tags || []
      };

      const stream = await streamService.createStream(req.userId, streamData);

      logger.info(`Stream created: ${stream.id} by user ${req.userId}`);

      res.status(201).json({
        success: true,
        message: 'Stream created successfully',
        stream: stream
      });

    } catch (error) {
      logger.error('Create stream error:', error);
      
      if (error.message.includes('Rate limit')) {
        return res.status(429).json({ error: error.message });
      }
      
      res.status(500).json({
        error: 'Failed to create stream',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // GET /api/streams/:id - Get specific stream details
  router.get('/:id', streamQueryLimiter, [
    param('id').notEmpty().withMessage('Stream ID is required')
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const streamId = req.params.id;
      const streamInfo = await streamService.getStreamInfo(streamId);

      if (!streamInfo) {
        return res.status(404).json({
          error: 'Stream not found'
        });
      }

      // Check if user can access this stream
      if (streamInfo.isPrivate) {
        const canAccess = streamInfo.userId === req.userId ||
                         streamInfo.settings?.allowedViewers?.includes(req.userId) ||
                         req.user.role === 'admin';
        
        if (!canAccess) {
          return res.status(403).json({
            error: 'Access denied. This is a private stream.'
          });
        }
      }

      // Check if user is blocked
      if (streamInfo.settings?.blockedUsers?.includes(req.userId)) {
        return res.status(403).json({
          error: 'Access denied. You are blocked from this stream.'
        });
      }

      res.json({
        success: true,
        stream: streamInfo
      });

    } catch (error) {
      logger.error('Get stream error:', error);
      res.status(500).json({
        error: 'Failed to fetch stream',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // PUT /api/streams/:id - Update stream details
  router.put('/:id', updateStreamValidation, async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const streamId = req.params.id;
      const streamInfo = await streamService.getStreamInfo(streamId);

      if (!streamInfo) {
        return res.status(404).json({
          error: 'Stream not found'
        });
      }

      // Check ownership
      if (streamInfo.userId !== req.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Access denied. You can only update your own streams.'
        });
      }

      const updateData = {};
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.category !== undefined) updateData.category = req.body.category;
      if (req.body.tags !== undefined) updateData.tags = req.body.tags;

      const updatedStream = await streamService.updateStream(streamId, updateData);

      res.json({
        success: true,
        message: 'Stream updated successfully',
        stream: updatedStream
      });

    } catch (error) {
      logger.error('Update stream error:', error);
      res.status(500).json({
        error: 'Failed to update stream',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // DELETE /api/streams/:id - End/delete a stream
  router.delete('/:id', [
    param('id').notEmpty().withMessage('Stream ID is required')
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const streamId = req.params.id;
      const streamInfo = await streamService.getStreamInfo(streamId);

      if (!streamInfo) {
        return res.status(404).json({
          error: 'Stream not found'
        });
      }

      // Check ownership
      if (streamInfo.userId !== req.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Access denied. You can only end your own streams.'
        });
      }

      const result = await streamService.endStream(streamId, req.userId);

      logger.info(`Stream ended: ${streamId} by user ${req.userId}`);

      res.json({
        success: true,
        message: 'Stream ended successfully',
        finalStats: result
      });

    } catch (error) {
      logger.error('End stream error:', error);
      res.status(500).json({
        error: 'Failed to end stream',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // POST /api/streams/:id/join - Join a stream (for viewers)
  router.post('/:id/join', streamQueryLimiter, [
    param('id').notEmpty().withMessage('Stream ID is required')
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const streamId = req.params.id;
      const result = await streamService.joinStream(req.userId, streamId);

      res.json({
        success: true,
        message: 'Joined stream successfully',
        data: result
      });

    } catch (error) {
      logger.error('Join stream error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Stream not found' });
      }
      if (error.message.includes('private')) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      res.status(500).json({
        error: 'Failed to join stream',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // GET /api/streams/:id/stats - Get stream analytics
  router.get('/:id/stats', streamQueryLimiter, [
    param('id').notEmpty().withMessage('Stream ID is required')
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const streamId = req.params.id;
      const streamInfo = await streamService.getStreamInfo(streamId);

      if (!streamInfo) {
        return res.status(404).json({
          error: 'Stream not found'
        });
      }

      // Only stream owner or admins can view detailed stats
      if (streamInfo.userId !== req.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Access denied. You can only view stats for your own streams.'
        });
      }

      const stats = await streamService.getDetailedStats(streamId);

      res.json({
        success: true,
        stats: stats
      });

    } catch (error) {
      logger.error('Get stream stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch stream statistics',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // GET /api/streams/user/:userId - Get streams by user
  router.get('/user/:userId', streamQueryLimiter, [
    param('userId').isMongoId().withMessage('Invalid user ID'),
    query('includeEnded').optional().isBoolean().withMessage('includeEnded must be boolean'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const userId = req.params.userId;
      const includeEnded = req.query.includeEnded === 'true';
      const limit = parseInt(req.query.limit) || 20;

      const streams = await streamService.getUserStreams(userId, {
        includeEnded,
        limit,
        viewerId: req.userId // To filter private streams
      });

      res.json({
        success: true,
        streams: streams,
        total: streams.length
      });

    } catch (error) {
      logger.error('Get user streams error:', error);
      res.status(500).json({
        error: 'Failed to fetch user streams',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  return router;
};
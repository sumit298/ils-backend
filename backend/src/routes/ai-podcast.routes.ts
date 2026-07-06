import express, { Request, Response } from 'express';
import AuthMiddleware from '../middleware/auth.middleware.js';
import AIPodcastService from '../services/AIPodcastService.js';
import AIPodcast from '../models/AIPodcast.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Create new AI podcast
router.post('/', AuthMiddleware.authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { topic, voice, duration, knowledgeBase } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const userId = (req as any).user.id;

    // Create database record
    const podcast = await AIPodcast.create({
      userId,
      topic,
      voice: voice || 'male',
      duration: duration || '5min',
      knowledgeBase,
      status: 'generating',
      podcastId: `temp-${Date.now()}`,
    });

    // Start generation in background
    AIPodcastService.generate({
      topic,
      voice: voice || 'male',
      duration: duration || '5min',
      knowledgeBase,
      userId,
    })
      .then(async (result) => {
        // Update with results
        podcast.podcastId = result.podcastId;
        podcast.script = result.script.map((turn) => ({
          speaker: turn.speaker,
          text: turn.text,
          audioUrl: turn.audioPath,
        }));
        podcast.status = 'ready';
        await podcast.save();
        
        console.log(`[API] Podcast generation completed: ${result.podcastId}`);
      })
      .catch(async (error) => {
        podcast.status = 'failed';
        podcast.error = error.message;
        await podcast.save();
        
        console.error(`[API] Podcast generation failed:`, error);
      });

    return res.status(201).json({
      message: 'Podcast generation started',
      podcastId: podcast._id,
      status: 'generating',
      estimatedTime: duration === '5min' ? '30 seconds' : duration === '10min' ? '45 seconds' : '60 seconds',
    });
  } catch (error: any) {
    console.error('[API] Error creating podcast:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get podcast by ID
router.get('/:id', AuthMiddleware.authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const podcast = await AIPodcast.findById(req.params.id);

    if (!podcast) {
      return res.status(404).json({ error: 'Podcast not found' });
    }

    // Check ownership
    if (podcast.userId.toString() !== (req as any).user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json(podcast);
  } catch (error: any) {
    console.error('[API] Error fetching podcast:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get user's podcasts
router.get('/', AuthMiddleware.authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = (req as any).user.id;
    const podcasts = await AIPodcast.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20);

    return res.json({ podcasts });
  } catch (error: any) {
    console.error('[API] Error fetching podcasts:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get audio URL (redirect to R2)
router.get('/:id/audio/:turnIndex', AuthMiddleware.authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const podcast = await AIPodcast.findById(req.params.id);

    if (!podcast) {
      return res.status(404).json({ error: 'Podcast not found' });
    }

    // Check ownership
    if (podcast.userId.toString() !== (req as any).user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const turnIndex = parseInt(req.params.turnIndex as string);
    const turn = podcast.script[turnIndex];

    if (!turn || !turn.audioUrl) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    // Return R2 URL directly
    return res.json({ audioUrl: turn.audioUrl });
  } catch (error: any) {
    console.error('[API] Error fetching audio URL:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Delete podcast
router.delete('/:id', AuthMiddleware.authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const podcast = await AIPodcast.findById(req.params.id);

    if (!podcast) {
      return res.status(404).json({ error: 'Podcast not found' });
    }

    // Check ownership
    if (podcast.userId.toString() !== (req as any).user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete audio files from R2
    if (podcast.script && podcast.script.length > 0) {
      for (const turn of podcast.script) {
        if (turn.audioUrl) {
          try {
            // Extract key from R2 URL
            const urlParts = turn.audioUrl.split('.r2.dev/');
            if (urlParts.length > 1) {
              const key = decodeURIComponent(urlParts[1]);
              // Delete from R2 using r2Service if available
              console.log(`[AI-PODCAST] Would delete R2 file: ${key}`);
            }
          } catch (e) {
            console.error('[AI-PODCAST] Failed to delete R2 file:', e);
          }
        }
      }
    }

    // Delete from database
    await podcast.deleteOne();

    return res.json({ message: 'Podcast deleted successfully' });
  } catch (error: any) {
    console.error('[API] Error deleting podcast:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;

import type { Request, Response } from 'express';
import type { Logger } from 'winston';
import type AIStreamerService from '../services/AI/AIStreamerService';
import AIStreamer from '../models/AIStreamer';

interface AIStreamerControllerDeps {
  aiStreamerService: AIStreamerService;
  logger: Logger;
}

class AIStreamerController {
  private aiStreamerService: AIStreamerService;
  private logger: Logger;

  constructor(deps: AIStreamerControllerDeps) {
    this.aiStreamerService = deps.aiStreamerService;
    this.logger = deps.logger;
  }

  // POST /api/ai-streamer/start
  start = async (req: Request, res: Response) => {
    try {
      const { topic, persona, voice, title, idlePromptIntervalMs, maxDurationMs } = req.body;

      if (!topic || !persona) {
        return res.status(400).json({ error: 'topic and persona are required' });
      }

      const streamer = await this.aiStreamerService.startStreamer({
        ownerId: req.userId,   // always from auth token, never from body
        topic,
        persona,
        voice: voice || 'male',
        title,
        idlePromptIntervalMs,
        maxDurationMs,
      });

      res.json({
        success: true,
        streamerId: streamer.id,
        streamId: streamer.streamId,
        url: `${process.env.FRONTEND_URL}/watch/${streamer.streamId}`,
      });
    } catch (err) {
      this.logger.error('Failed to start AI streamer:', err);
      res.status(500).json({ error: 'Failed to start AI streamer' });
    }
  };

  // POST /api/ai-streamer/:id/stop
  stop = async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      const streamer = await AIStreamer.findById(id);
      if (!streamer) {
        return res.status(404).json({ error: 'AI streamer not found' });
      }
      if (streamer.ownerId.toString() !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to stop this streamer' });
      }

      await this.aiStreamerService.stopStreamer(id);
      res.json({ success: true });
    } catch (err) {
      this.logger.error('Failed to stop AI streamer:', err);
      res.status(500).json({ error: 'Failed to stop AI streamer' });
    }
  };

  // GET /api/ai-streamer/:id/status
  status = async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      const streamer = await AIStreamer.findById(id);
      if (!streamer) {
        return res.status(404).json({ error: 'AI streamer not found' });
      }
      if (streamer.ownerId.toString() !== req.userId) {
        return res.status(403).json({ error: 'Not authorized to view this streamer' });
      }

      res.json({ active: this.aiStreamerService.isActive(id), streamerId: id });
    } catch (err) {
      this.logger.error('Failed to get AI streamer status:', err);
      res.status(500).json({ error: 'Failed to get status' });
    }
  };
}

export default AIStreamerController;

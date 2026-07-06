import type { Request, Response } from 'express';
import type { Logger } from 'winston';
import type AIStreamerService from '../services/AI/AIStreamerService';

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
      const { ownerId, topic, persona, voice, title, idlePromptIntervalMs, maxDurationMs } = req.body;

      if (!ownerId || !topic || !persona) {
        return res.status(400).json({ error: 'ownerId, topic, and persona are required' });
      }

      const streamer = await this.aiStreamerService.startStreamer({
        ownerId,
        topic,
        persona,
        voice: voice || 'male',
        title: title || `🤖 ${persona} — ${topic}`,
        idlePromptIntervalMs,
        maxDurationMs,
      });

      res.json({
        success: true,
        streamerId: streamer.id,
        streamId: streamer.streamId,
        url: `http://localhost:3000/watch/${streamer.streamId}`,
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
      await this.aiStreamerService.stopStreamer(id);
      res.json({ success: true });
    } catch (err) {
      this.logger.error('Failed to stop AI streamer:', err);
      res.status(500).json({ error: 'Failed to stop AI streamer' });
    }
  };

  // GET /api/ai-streamer/:id/status
  status = async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const active = this.aiStreamerService.isActive(id);
    res.json({ active, streamerId: id });
  };
}

export default AIStreamerController;

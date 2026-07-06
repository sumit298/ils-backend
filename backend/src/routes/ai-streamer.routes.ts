import { Router } from 'express';
import AIStreamerController from '../controllers/ai-streamer.controller';
import type AIStreamerService from '../services/AI/AIStreamerService';
import type { Logger } from 'winston';

interface Deps {
  aiStreamerService: AIStreamerService;
  logger: Logger;
}

export default function createAIStreamerRoutes(deps: Deps): Router {
  const router = Router();
  const controller = new AIStreamerController(deps);

  router.post('/start', controller.start);
  router.post('/:id/stop', controller.stop);
  router.get('/:id/status', controller.status);

  return router;
}

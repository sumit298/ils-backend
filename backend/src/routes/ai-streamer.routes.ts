import { Router } from 'express';
import AIStreamerController from '../controllers/ai-streamer.controller';
import AuthMiddleware from '../middleware/auth.middleware';
import type AIStreamerService from '../services/AI/AIStreamerService';
import type { Logger } from 'winston';

interface Deps {
  aiStreamerService: AIStreamerService;
  logger: Logger;
}

export default function createAIStreamerRoutes(deps: Deps): Router {
  const router = Router();
  const controller = new AIStreamerController(deps);

  router.post('/start', AuthMiddleware.authenticate, controller.start);
  router.post('/:id/stop', AuthMiddleware.authenticate, controller.stop);
  router.get('/:id/status', AuthMiddleware.authenticate, controller.status);

  return router;
}

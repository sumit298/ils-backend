import { Router } from 'express';
import AIStreamerController from '../controllers/ai-streamer.controller';
import type MediaService from '../services/MediaService';
import type { Logger } from 'winston';

interface AIStreamerRoutesDeps {
  mediaService: MediaService;
  logger: Logger;
}

export default function createAIStreamerRoutes(deps: AIStreamerRoutesDeps): Router {
  const router = Router();
  const controller = new AIStreamerController(deps);

  // Start AI test stream
  router.post('/test', controller.startTestStream);

  // Stop AI test stream
  router.post('/stop', controller.stopTestStream);

  // Get status
  router.get('/status', controller.getStatus);

  return router;
}

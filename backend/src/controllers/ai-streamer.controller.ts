import type { Request, Response } from 'express';
import type { Logger } from 'winston';
import TTSService from '../services/TTSService';
import AudioStreamProducer from '../services/AI/AudioStreamProducer';
import type MediaService from '../services/MediaService';
import Stream from '../models/Stream';
import User from '../models/User';

interface AIStreamerControllerDeps {
  mediaService: MediaService;
  logger: Logger;
}

class AIStreamerController {
  private mediaService: MediaService;
  private logger: Logger;
  private activeStreamers: Map<string, AudioStreamProducer> = new Map();

  constructor(deps: AIStreamerControllerDeps) {
    this.mediaService = deps.mediaService;
    this.logger = deps.logger;
  }

  /**
   * Start AI test stream
   * POST /api/ai-streamer/test
   */
  startTestStream = async (req: Request, res: Response) => {
    try {
      const roomId = 'ai-test-stream-live';
      const aiUserId = 'ai-test-user-live';

      this.logger.info('🤖 Starting AI test stream...');

      // Check if already running
      if (this.activeStreamers.has(roomId)) {
        return res.status(400).json({ 
          error: 'AI test stream already running',
          streamId: roomId 
        });
      }

      // Create or get room in the server's MediaSoup
      const room = await this.mediaService.createRoom(roomId);
      this.logger.info(`✓ Room created/retrieved: ${roomId}`);

      // Create PlainTransport
      const { transport, rtpPort } = await this.mediaService.createPlainTransport(
        roomId,
        aiUserId
      );
      this.logger.info(`✓ PlainTransport created - RTP Port: ${rtpPort}`);

      // Create audio producer
      const producer = await this.mediaService.produceOnPlainTransport(
        roomId,
        aiUserId,
        transport,
        'audio'
      );
      const producerSsrc = producer.rtpParameters.encodings[0].ssrc;
      this.logger.info(`✓ AI Audio Producer created: ${producer.id} (SSRC: ${producerSsrc})`);

      // Generate TTS audio FIRST
      const testScript = [
        "Hello! I am an AI streamer, broadcasting live through the server.",
        "This is a real-time test of continuous audio streaming.",
        "You should be hearing my voice without any gaps or interruptions.",
        "The audio pipeline uses a single FFmpeg process for seamless playback.",
        "If you can hear all five sentences clearly, the test is successful!",
      ];

      this.logger.info('🗣️ Generating TTS audio...');
      const pcmBuffers: Buffer[] = [];
      for (const line of testScript) {
        const audioBuffer = await TTSService.synthesizeForStreaming(line, { voice: 'male' });
        pcmBuffers.push(audioBuffer);
      }
      this.logger.info(`✓ Generated ${pcmBuffers.length} audio segments`);

      // Start FFmpeg and begin streaming BEFORE creating Stream document
      const audioProducer = new AudioStreamProducer(this.logger);
      this.activeStreamers.set(roomId, audioProducer);

      await audioProducer.startStream(rtpPort, producerSsrc);
      this.logger.info('✓ FFmpeg started, audio is flowing...');

      // Stream the first 500ms so MediaSoup can learn the remote RTP tuple.
      await audioProducer.streamSegment(pcmBuffers[0], 500);
      this.logger.info('✓ First 500ms streamed, audio pipeline established');

      // Wait to ensure RTP packets are flowing through MediaSoup
      await new Promise(resolve => setTimeout(resolve, 500));
      this.logger.info('✓ RTP pipeline warm - now making stream discoverable');

      // NOW create Stream document - audio is already flowing!
      let testUser = await User.findOne({ username: 'ai-test-user' });
      if (!testUser) {
        testUser = await User.create({
          username: 'ai-test-user',
          email: 'ai@test.com',
          password: 'test123',
        });
      }

      await Stream.deleteOne({ id: roomId });

      const streamDoc = await Stream.create({
        id: roomId,
        userId: testUser._id,
        title: '🤖 AI Test Stream - LIVE',
        description: 'Testing AI audio streaming - Join to hear the AI speak!',
        category: 'technology',
        tags: ['AI', 'Test', 'Live'],
        isLive: true,
        startedAt: new Date(),
      });

      this.logger.info(`✓ Stream document created: ${streamDoc._id}`);

      // Continue looping in background
      this.streamAudioLoop(audioProducer, pcmBuffers, roomId).catch(err => {
        this.logger.error('Audio streaming error:', err);
        this.activeStreamers.delete(roomId);
      });

      // Return immediately
      res.json({
        success: true,
        streamId: roomId,
        producerId: producer.id,
        message: 'AI stream started! Open http://localhost:3000/watch/' + roomId,
        url: `http://localhost:3000/watch/${roomId}`,
      });

    } catch (error) {
      this.logger.error('Failed to start AI test stream:', error);
      res.status(500).json({ error: 'Failed to start AI stream' });
    }
  };

  /**
   * Stream audio in a loop
   */
  private async streamAudioLoop(
    audioProducer: AudioStreamProducer,
    pcmBuffers: Buffer[],
    roomId: string
  ): Promise<void> {
    try {
      // First batch already streamed before this loop starts
      // Just keep looping
      for (let loop = 0; loop < 20; loop++) {
        if (!this.activeStreamers.has(roomId) || !audioProducer.isActive()) {
          this.logger.info('AI audio loop stopped');
          return;
        }

        this.logger.info(`🔄 Looping audio (iteration ${loop + 1}/20)`);
        for (let i = 0; i < pcmBuffers.length; i++) {
          if (!this.activeStreamers.has(roomId) || !audioProducer.isActive()) {
            this.logger.info('AI audio loop stopped');
            return;
          }

          await audioProducer.streamSegment(pcmBuffers[i]);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // End the stream
      await audioProducer.endStream();
      this.logger.info('✓ AI stream ended');

      // Cleanup
      this.activeStreamers.delete(roomId);
      await this.mediaService.closeParticipant(roomId, 'ai-test-user-live');

      // Mark stream as ended
      await Stream.updateOne({ id: roomId }, { isLive: false, endedAt: new Date() });

    } catch (error) {
      this.activeStreamers.delete(roomId);
      if (audioProducer.isActive()) {
        this.logger.error('Audio streaming loop error:', error);
      } else {
        this.logger.info('AI audio loop stopped');
      }
    }
  }

  /**
   * Stop AI test stream
   * POST /api/ai-streamer/stop
   */
  stopTestStream = async (req: Request, res: Response) => {
    try {
      const roomId = 'ai-test-stream-live';

      const audioProducer = this.activeStreamers.get(roomId);
      if (!audioProducer) {
        return res.status(404).json({ error: 'No active AI stream found' });
      }

      audioProducer.cleanup();
      this.activeStreamers.delete(roomId);

      await this.mediaService.closeParticipant(roomId, 'ai-test-user-live');
      await Stream.updateOne({ id: roomId }, { isLive: false, endedAt: new Date() });

      this.logger.info('✓ AI test stream stopped');

      res.json({ success: true, message: 'AI stream stopped' });
    } catch (error) {
      this.logger.error('Failed to stop AI stream:', error);
      res.status(500).json({ error: 'Failed to stop AI stream' });
    }
  };

  /**
   * Get AI stream status
   * GET /api/ai-streamer/status
   */
  getStatus = async (req: Request, res: Response) => {
    const roomId = 'ai-test-stream-live';
    const isActive = this.activeStreamers.has(roomId);

    res.json({
      active: isActive,
      streamId: roomId,
      url: isActive ? `http://localhost:3000/watch/${roomId}` : null,
    });
  };
}

export default AIStreamerController;

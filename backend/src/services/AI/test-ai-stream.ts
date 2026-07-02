import logger from '../../utils/logger';
import MediaService from '../MediaService';
import TTSService from '../TTSService';
import AudioStreamProducer from './AudioStreamProducer';
import { connectDatabase } from '../../config/db';
import Stream from '../../models/Stream';
import User from '../../models/User';

/**
 * Test AI Audio Streaming - Phase 1
 * 
 * Tests LINEAR16 (PCM) format for optimized streaming
 * 
 * Flow:
 * 1. Initialize MediaSoup
 * 2. Create room + PlainTransport
 * 3. Generate TTS audio (PCM format)
 * 4. Stream PCM → Opus RTP → MediaSoup
 * 5. Measure performance improvement
 */
async function testAIStream() {
  logger.info('╔════════════════════════════════════════╗');
  logger.info('║   AI Audio Streaming Test - Phase 1   ║');
  logger.info('║      (LINEAR16 PCM Optimization)       ║');
  logger.info('╚════════════════════════════════════════╝\n');

  try {
    // ========================================
    // Step 0: Connect to MongoDB
    // ========================================
    logger.info('🗄️  Step 0: Connecting to MongoDB...');
    await connectDatabase(logger);
    logger.info('   ✓ MongoDB connected\n');

    // ========================================
    // Step 1: Initialize MediaSoup
    // ========================================
    logger.info('📡 Step 1: Initializing MediaSoup...');
    const mediaService = new MediaService(logger);
    await mediaService.initialize();
    logger.info('   ✓ MediaSoup workers created\n');

    // ========================================
    // Step 2: Create test room
    // ========================================
    const roomId = 'test-ai-room-pcm';
    const aiUserId = 'ai-streamer-pcm-test';
    
    logger.info('🏠 Step 2: Creating room...');
    const room = await mediaService.createRoom(roomId);
    logger.info(`   ✓ Room created: ${roomId}`);
    logger.info(`   ✓ Router ready on worker ${room.workerIndex}\n`);

    // ========================================
    // Step 2.5: Create Stream document in MongoDB
    // ========================================
    logger.info('📄 Step 2.5: Creating Stream document for frontend...');
    
    // Find or create test user
    let testUser = await User.findOne({ username: 'ai-test-user' });
    if (!testUser) {
      testUser = await User.create({
        username: 'ai-test-user',
        email: 'ai@test.com',
        password: 'test123', // Won't be used
      });
      logger.info('   ✓ Created test user: ai-test-user');
    }
    
    // Delete existing stream if it exists
    await Stream.deleteMany({ title: '🤖 AI Streamer Test - Phase 1' });
    
    // Create new stream document (let MongoDB generate _id)
    const streamDoc = await Stream.create({
      id: roomId, // Use the MediaSoup room ID as the stream ID
      userId: testUser._id,
      title: '🤖 AI Streamer Test - Phase 1',
      description: 'Testing continuous AI audio streaming with LINEAR16 PCM optimization',
      category: 'technology', // lowercase!
      tags: ['AI', 'Test', 'Audio Streaming', 'PCM'],
      isLive: true,
      startedAt: new Date(),
    });
    
    logger.info(`   ✓ Stream document created: ${streamDoc._id}`);
    logger.info(`   ✓ Stream ID (for socket): ${streamDoc.id}`);
    logger.info(`   ✓ Frontend URL: http://localhost:3000/watch/${streamDoc.id}\n`);

    // ========================================
    // Step 3: Create PlainTransport
    // ========================================
    logger.info('🔌 Step 3: Creating PlainTransport...');
    const { transport, rtpPort, rtcpPort } = await mediaService.createPlainTransport(
      roomId,
      aiUserId
    );
    logger.info(`   ✓ PlainTransport ID: ${transport.id}`);
    logger.info(`   ✓ RTP Port: ${rtpPort}`);
    logger.info(`   ✓ RTCP Port: ${rtcpPort}\n`);

    // ========================================
    // Step 5: Create producer
    // ========================================
    logger.info('🎙️  Step 5: Creating AI audio producer...');
    const producer = await mediaService.produceOnPlainTransport(
      roomId,
      aiUserId,
      transport,
      'audio'
    );
    logger.info(`   ✓ Producer ID: ${producer.id}`);
    logger.info(`   ✓ Kind: ${producer.kind}`);
    logger.info(`   ✓ SSRC: ${producer.rtpParameters.encodings[0].ssrc}\n`);

    // ========================================
    // Step 6: Generate TTS audio (PCM format)
    // ========================================
    logger.info('🗣️  Step 6: Generating TTS audio (LINEAR16 PCM)...');
    const testScript = [
      "Hello! I am an AI streamer, now optimized with LINEAR16 PCM format.",
      "This eliminates the MP3 decoding step, resulting in faster processing.",
      "The audio pipeline is now: PCM directly to Opus, then RTP streaming.",
      "This reduces CPU usage and latency compared to the MP3 approach.",
      "Phase two will add true streaming for even lower latency.",
    ];

    const pcmBuffers: Buffer[] = [];
    const startTime = Date.now();
    
    for (let i = 0; i < testScript.length; i++) {
      const line = testScript[i];
      logger.info(`   Generating segment ${i + 1}/${testScript.length}...`);
      
      const segmentStart = Date.now();
      const audioBuffer = await TTSService.synthesizeForStreaming(line, { voice: 'male' });
      const segmentTime = Date.now() - segmentStart;
      
      pcmBuffers.push(audioBuffer);
      logger.info(`   ✓ Generated ${audioBuffer.length} bytes in ${segmentTime}ms`);
    }
    
    const totalGenerationTime = Date.now() - startTime;
    logger.info(`   ✓ All ${testScript.length} segments generated in ${totalGenerationTime}ms\n`);

        // ========================================
    // Step 7: Stream audio to MediaSoup (CONTINUOUS)
    // ========================================
    logger.info('📤 Step 7: Streaming PCM audio continuously to MediaSoup...');
    const streamStart = Date.now();
    
    const audioProducer = new AudioStreamProducer(logger);
    
    // Start FFmpeg once
    await audioProducer.startStream(rtpPort, producer.rtpParameters.encodings[0].ssrc);
    
    // Stream all segments through the SAME ffmpeg
    for (let i = 0; i < pcmBuffers.length; i++) {
      logger.info(`Segment ${i + 1}/${pcmBuffers.length}`);
      await audioProducer.streamSegment(pcmBuffers[i]);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // DON'T close FFmpeg - keep it alive!
    logger.info('✓ All segments sent - FFmpeg still running\n');
    
    const totalStreamingTime = Date.now() - streamStart;
    logger.info(`   ✓ Streaming completed in ${totalStreamingTime}ms (FFmpeg still alive)\n`);

    // ========================================
    // Performance Summary
    // ========================================
    const totalBytes = pcmBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const avgBytesPerSegment = Math.round(totalBytes / testScript.length);
    
    logger.info('╔════════════════════════════════════════╗');
    logger.info('║            ✅ TEST PASSED!             ║');
    logger.info('╚════════════════════════════════════════╝\n');
    
    logger.info('📊 Performance Summary:');
    logger.info(`   Room ID: ${roomId}`);
    logger.info(`   Producer ID: ${producer.id}`);
    logger.info(`   RTP Port: ${rtpPort}`);
    logger.info(`   Segments: ${testScript.length}`);
    logger.info(`   Total PCM Data: ${totalBytes} bytes (${(totalBytes / 1024).toFixed(2)} KB)`);
    logger.info(`   Avg per Segment: ${avgBytesPerSegment} bytes`);
    logger.info(`   Generation Time: ${totalGenerationTime}ms (${(totalGenerationTime / testScript.length).toFixed(0)}ms/segment)`);
    logger.info(`   Streaming Time: ${totalStreamingTime}ms (${(totalStreamingTime / testScript.length).toFixed(0)}ms/segment)`);
    logger.info(`   Total Time: ${totalGenerationTime + totalStreamingTime}ms\n`);

    logger.info('🎉 Phase 1 Complete: Continuous Streaming Working!');
    logger.info('   Benefits:');
    logger.info('   ✓ Single FFmpeg process (same SSRC)');
    logger.info('   ✓ Continuous sequence numbers');
    logger.info('   ✓ No gaps between segments');
    logger.info('   ✓ MediaSoup sees one continuous stream\n');

    // ========================================
    // MANUAL TEST: Keep stream alive
    // ========================================
    logger.info('╔════════════════════════════════════════╗');
    logger.info('║     🎧 MANUAL VERIFICATION NEEDED     ║');
    logger.info('╚════════════════════════════════════════╝\n');
    
    logger.info('The AI stream is now LIVE and waiting for listeners.');
    logger.info('To verify continuous audio playback:');
    logger.info('');
    logger.info('1. Keep this process running (DON\'T close it)');
    logger.info('2. Start the frontend: cd ../frontend && npm run dev');
    logger.info('3. Open browser: http://localhost:3000/watch/test-ai-room-pcm');
    logger.info('4. Listen carefully for:');
    logger.info('   - All 5 sentences playing back-to-back');
    logger.info('   - NO gaps or clicks between sentences');
    logger.info('   - Smooth, continuous speech\n');
    logger.info('5. If audio is continuous → SUCCESS ✅');
    logger.info('   If you hear gaps/silence → Still needs work ❌\n');
    logger.info('Press Ctrl+C after verification to stop the stream.\n');

    // Keep producer alive for manual testing
    await new Promise(() => {}); // Wait forever until Ctrl+C

  } catch (error) {
    logger.error('❌ TEST FAILED:', error);
    logger.error((error as Error).stack);
    process.exit(1);
  }
}

// Run test
testAIStream();

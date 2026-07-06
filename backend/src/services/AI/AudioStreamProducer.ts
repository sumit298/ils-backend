import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import type { Logger } from 'winston';

/**
 * AudioStreamProducer
 * 
 * Maintains a SINGLE long-running FFmpeg process for continuous RTP streaming
 * This ensures:
 * - Same SSRC across all segments
 * - Continuous sequence numbers
 * - No gaps in audio playback
 * - MediaSoup sees it as ONE continuous stream
 * 
 * Pipeline: PCM Buffers → Single FFmpeg → Continuous Opus RTP → PlainTransport
 */
class AudioStreamProducer {
  private logger: Logger;
  private ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
  private isStreaming: boolean = false;
  private rtpPort: number | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  private normalizePcmBuffer(pcmBuffer: Buffer): Buffer {
    if (pcmBuffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
      return pcmBuffer;
    }

    const dataChunkOffset = pcmBuffer.indexOf('data', 12, 'ascii');
    if (dataChunkOffset === -1 || dataChunkOffset + 8 >= pcmBuffer.length) {
      return pcmBuffer;
    }

    return pcmBuffer.subarray(dataChunkOffset + 8);
  }

  /**
   * Start the streaming session
   * Creates a single FFmpeg process that stays alive
   */
  async startStream(rtpPort: number, ssrc: number): Promise<void> {
    if (this.isStreaming) {
      throw new Error('Stream already started');
    }

    this.rtpPort = rtpPort;
    this.logger.info(`Starting continuous audio stream to RTP port ${rtpPort}`);

    return new Promise((resolve, reject) => {
      try {
        // Start FFmpeg ONCE - keep it alive for entire stream
        this.ffmpegProcess = spawn('ffmpeg', [
          '-re',                            // Pace raw PCM reads in real time
          '-f', 's16le',                    // Input format: signed 16-bit PCM
          '-ar', '48000',                   // Sample rate: 48kHz
          '-ac', '1',                       // Google LINEAR16 TTS is mono PCM
          '-i', 'pipe:0',                   // Read continuously from stdin
          '-ac', '2',                       // Encode stereo Opus for MediaSoup
          '-c:a', 'libopus',                // Codec: Opus
          '-b:a', '128k',                   // Bitrate: 128kbps
          '-application', 'voip',           // Optimize for voice
          '-frame_duration', '20',          // 20ms frames
          '-packet_loss', '5',              // Add FEC for packet loss
          '-vbr', 'on',                     // Variable bitrate
          '-f', 'rtp',                      // Output format: RTP
          '-payload_type', '111',           // Opus payload type
          '-ssrc', String(ssrc),            // Must match the MediaSoup Producer
          `rtp://127.0.0.1:${rtpPort}`      // Send to PlainTransport
        ]);

        // Log FFmpeg output
        this.ffmpegProcess.stderr.on('data', (data) => {
          this.logger.debug(`FFmpeg: ${data.toString().trim()}`);
        });

        this.ffmpegProcess.stdin.on('error', (err: NodeJS.ErrnoException) => {
          // this.isStreaming = false;
          if (err.code === 'EPIPE') {
            this.logger.info('FFmpeg stdin closed while stopping stream');
            this.cleanup();
            return;
          }
          this.logger.error('FFmpeg stdin error:', err);
          this.cleanup();
        });

        // Handle unexpected process exit
        this.ffmpegProcess.on('close', (code) => {
          this.logger.warn(`FFmpeg process exited with code ${code}`);
          this.isStreaming = false;
        });

        // Handle errors
        this.ffmpegProcess.on('error', (err) => {
          this.logger.error('FFmpeg process error:', err);
          this.isStreaming = false;
          reject(err);
        });

        // Mark as streaming
        this.isStreaming = true;
        this.logger.info('✓ FFmpeg streaming process started (will stay alive)');
        
        // Give FFmpeg a moment to initialize
        setTimeout(() => resolve(), 100);

      } catch (error) {
        this.logger.error('Failed to start stream:', error);
        this.cleanup();
        reject(error);
      }
    });
  }

  /**
   * Stream a single audio segment through the existing FFmpeg process
   * This maintains continuous SSRC and sequence numbers
   */
  async streamSegment(pcmBuffer: Buffer, maxDurationMs?: number): Promise<void> {
    if (!this.isStreaming || !this.ffmpegProcess) {
      throw new Error('Stream not started. Call startStream() first.');
    }

    return new Promise((resolve, reject) => {
      try {
        const normalizedBuffer = this.normalizePcmBuffer(pcmBuffer);
        const bytesPerMs = 48000 * 1 * 2 / 1000;
        const audioBuffer = maxDurationMs
          ? normalizedBuffer.subarray(0, Math.floor(bytesPerMs * maxDurationMs))
          : normalizedBuffer;

        this.logger.info(`Streaming segment: ${audioBuffer.length} bytes`);

        // Write to existing FFmpeg stdin (DON'T close it!)
        const process = this.ffmpegProcess;
        if (!process || !this.isStreaming || process.stdin.destroyed || process.killed) {
          resolve();
          return;
        }

        const written = process.stdin.write(audioBuffer);

        if (!written) {
          // Buffer is full, wait for drain
          process.stdin.once('drain', () => {
            this.logger.debug('FFmpeg stdin drained, continuing...');
            resolve();
          });
        } else {
          // Written successfully, continue immediately
          resolve();
        }

      } catch (error) {
        this.logger.error('Stream segment error:', error);
        reject(error);
      }
    });
  }

  /**
   * Stream multiple segments through the same FFmpeg instance
   * This is the key method for continuous playback
   */
  async streamMultiple(pcmBuffers: Buffer[], rtpPort: number, ssrc: number): Promise<void> {
    this.logger.info(`Starting continuous stream of ${pcmBuffers.length} segments`);

    // Start the long-running FFmpeg process
    await this.startStream(rtpPort, ssrc);

    try {
      // Stream each segment through the SAME ffmpeg
      for (let i = 0; i < pcmBuffers.length; i++) {
        this.logger.info(`Segment ${i + 1}/${pcmBuffers.length}`);
        await this.streamSegment(pcmBuffers[i]);
        
        // Small delay to prevent overwhelming FFmpeg's stdin buffer
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      this.logger.info('✓ All segments streamed continuously');

    } catch (error) {
      this.logger.error('Stream multiple error:', error);
      throw error;
    }
  }

  /**
   * End the streaming session
   * Closes FFmpeg stdin gracefully
   */
  async endStream(): Promise<void> {
    if (!this.isStreaming || !this.ffmpegProcess) {
      this.logger.warn('No active stream to end');
      return;
    }

    this.logger.info('Ending audio stream...');

    return new Promise((resolve) => {
      // Close stdin to signal end of input
      this.ffmpegProcess!.stdin.end();

      // Wait for FFmpeg to finish processing and exit
      this.ffmpegProcess!.on('close', (code) => {
        this.logger.info(`FFmpeg exited cleanly with code ${code}`);
        this.isStreaming = false;
        this.ffmpegProcess = null;
        resolve();
      });

      // Force kill if it doesn't exit in 5 seconds
      setTimeout(() => {
        if (this.ffmpegProcess) {
          this.logger.warn('FFmpeg did not exit gracefully, forcing kill');
          this.cleanup();
          resolve();
        }
      }, 5000);
    });
  }

  /**
   * Force cleanup (emergency stop)
   */
  cleanup(): void {
    if (this.ffmpegProcess) {
      try {
        this.isStreaming = false;
        if (!this.ffmpegProcess.stdin.destroyed) {
          this.ffmpegProcess.stdin.destroy();
        }
        this.ffmpegProcess.kill('SIGTERM');
        this.logger.info('FFmpeg process killed');
      } catch (err) {
        this.logger.error('Error killing FFmpeg:', err);
      }
      this.ffmpegProcess = null;
    }
  }

  /**
   * Check if currently streaming
   */
  isActive(): boolean {
    return this.isStreaming;
  }
}

export default AudioStreamProducer;

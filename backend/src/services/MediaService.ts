import * as mediasoup from "mediasoup";
import type {
  Worker,
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCodecCapability,
  RtpCapabilities,
  DtlsParameters,
  RtpParameters,
  MediaKind,
} from "mediasoup/types";
import * as os from "os";
import type { Logger } from "winston";
import {
  RTC_MIN_PORT,
  RTC_MAX_PORT,
  MAX_WORKERS,
} from "../config/mediasoup.config";

// ============================================================================
// TYPE DEFINITIONS - Understanding MediaSoup's Type System
// ============================================================================

/**
 * LEARNING: MediaSoup uses specific types for media kinds
 * Using literal types ensures type safety
 */
type MediaKindType = "audio" | "video";

/**
 * LEARNING: Transport direction - discriminated union
 * This prevents invalid values like 'receive' or 'sending'
 */
type TransportDirection = "send" | "recv";

/**
 * LEARNING: Participant structure - represents a user in a room
 * Maps are used for O(1) lookups by ID
 */
interface Participant {
  id: string;
  transports: Map<string, WebRtcTransport> | any;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
  joinedAt: number;
}

/**
 * LEARNING: Room structure - represents a streaming room
 * Router is the core MediaSoup object that handles media routing
 */
interface Room {
  id: string;
  router: Router;
  participants: Map<string, Participant>;
  createdAt: number;
  workerIndex: number;
}

/**
 * LEARNING: Transport data returned to client
 * These are the WebRTC connection parameters
 */
interface TransportData {
  id: string;
  iceParameters: unknown; // complex mediasoup type
  iceCandidates: unknown[]; // array of ice candidates
  dtlsParameters: DtlsParameters;
}

/**
 * LEARNING: Producer data returned to client
 * Producer = media source (camera, mic, screen)
 */
interface ProducerData {
  id: string;
  kind: MediaKindType;
  appData?: {
    userId: string;
    kind: MediaKindType;
    isScreenShare?: boolean;
  };
}

/**
 * LEARNING: Consumer data returned to client
 * Consumer = media sink (receives media from producer)
 */
interface ConsumerData {
  id: string;
  kind: MediaKindType;
  rtpParameters: unknown;
  producerId: string;
}

/**
 * LEARNING: Room statistics for monitoring
 */
interface RoomStats {
  id: string;
  participants: number;
  createdAt: number;
  uptime: number;
  workerIndex: number;
}

/**
 * LEARNING: Codec configuration for audio/video
 * RtpCodecCapability is MediaSoup's type for codec specs
 */
type CodecOptions = RtpCodecCapability[];

/**
 * LEARNING: Router capabilities returned to client
 * Client needs this to know what codecs/extensions are supported
 */
interface RouterCapabilities {
  codecs: CodecOptions;
  headerExtensions: Array<{
    kind: string;
    uri: string;
    preferredId: number;
    preferredEncrypt: boolean;
    direction: string;
  }>;
}

class MediaService {
  private readonly logger: Logger;

  /**
   * LEARNING: Workers are MediaSoup processes that handle media
   * Multiple workers = better CPU utilization across cores
   */
  private workers: (Worker | null)[];

  /**
   * LEARNING: Round-robin index for load balancing across workers
   */
  private workerIndex: number;

  /**
   * LEARNING: Map of active rooms (roomId -> Room)
   * Map provides O(1) lookup performance
   */
  private readonly rooms: Map<string, Room>;

  /**
   * Get room by ID (public accessor)
   */
  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all rooms (public accessor)
   */
  public getRooms(): Map<string, Room> {
    return this.rooms;
  }

  /**
   * LEARNING: Limit consumers per router to prevent overload
   */
  private readonly maxConsumersPerRouter: number;

  /**
   * LEARNING: Codec configuration (VP8, H264, Opus)
   */
  private readonly codecOptions: CodecOptions;

  constructor(logger: Logger) {
    this.logger = logger;
    this.workers = [];
    this.workerIndex = 0;
    this.rooms = new Map();
    this.maxConsumersPerRouter = 400;
    this.codecOptions = this.getOptimizedCodecs();
  }

  /**
   * Initialize MediaSoup workers
   *
   * LEARNING: Creates one worker per CPU core (max 8)
   * Workers run in separate processes for true parallelism
   */
  async initialize(): Promise<void> {
    const numWorkers = Math.min(os.cpus().length, MAX_WORKERS);
    this.logger.info(`Creating ${numWorkers} mediasoup workers`);

    for (let i = 0; i < numWorkers; i++) {
      await this.createWorker(i);
    }

    this.logger.info(
      `Mediasoup initialized with ${this.workers.length} workers`,
    );
    this.logger.info(
      `RTC port range: ${RTC_MIN_PORT}-${RTC_MAX_PORT} (${RTC_MAX_PORT - RTC_MIN_PORT} ports available)`,
    );

    // sweep idle rooms every 5 minutes
    /**
     * LEARNING: Cleanup idle rooms every 5 minutes
     * setInterval with arrow function to preserve 'this' context
     */
    setInterval(
      () => {
        for (const [roomId, room] of this.rooms) {
          if (room.participants.size === 0) {
            try {
              room.router.close();
            } catch (e) {
              /* already closed */
            }
            this.rooms.delete(roomId);
            this.logger.info(`Room ${roomId} closed (idle)`);
          }
        }
      },
      5 * 60 * 1000,
    ); // 5 minutes in milliseconds
  }

  /**
   * Create a MediaSoup worker
   *
   * LEARNING: Worker configuration
   * - logLevel: 'error' = minimal logging for production
   * - rtcMinPort/rtcMaxPort: UDP port range for WebRTC
   * - appData: custom data attached to worker
   */
  async createWorker(index: number): Promise<Worker> {
    try {
      const worker = await mediasoup.createWorker({
        logLevel: "error",
        rtcMinPort: RTC_MIN_PORT,
        rtcMaxPort: RTC_MAX_PORT,
        appData: { workerId: index },
      });

      /**
       * LEARNING: Worker 'died' event handler
       * If worker crashes, automatically respawn it
       */
      worker.on("died", async () => {
        this.logger.error(`Worker ${index} died, respawning...`);
        this.removeRoomsForWorker(index);
        await this.respawnWorker(index);
      });

      this.workers[index] = worker;
      return worker;
    } catch (error) {
      this.logger.error(`Failed to create worker ${index}:`, error);
      throw error;
    }
  }

  private removeRoomsForWorker(workerIndex: number): void {
    for (const [roomId, room] of this.rooms) {
      if (room.workerIndex !== workerIndex) {
        continue;
      }

      try {
        if (!room.router.closed) {
          room.router.close();
        }
      } catch (error) {
        this.logger.warn(`Error closing stale room ${roomId}:`, error);
      }

      this.rooms.delete(roomId);
      this.logger.warn(`Room ${roomId} removed because worker ${workerIndex} is closed`);
    }
  }

  /**
   * Respawn a dead worker
   *
   * LEARNING: Graceful recovery from worker crashes
   * Uses exponential backoff (5s delay) if respawn fails
   */
  async respawnWorker(index: number): Promise<void> {
    try {
      if (this.workers[index]) {
        this.workers[index]!.close();
        this.workers[index] = null;
      }
      await this.createWorker(index);

      this.logger.info(`Worker ${index} respawned successfully`);
    } catch (error) {
      this.logger.error(`Failed to respawn worker ${index}:`, error);
      // Schedule retry with backoff
      setTimeout(() => this.respawnWorker(index), 5000);
    }
  }

  /**
   * Get next available worker (round-robin)
   *
   * LEARNING: Load balancing pattern
   * - Cycles through workers in order
   * - Skips closed/dead workers
   * - Throws if no healthy workers available
   */
  getNextWorker(): Worker {
    if (this.workers.length === 0) {
      throw new Error("No workers available");
    }

    const startIndex = this.workerIndex;
    /**
     * LEARNING: do-while loop to find healthy worker
     * Stops when we've checked all workers (back to start)
     */
    do {
      const worker = this.workers[this.workerIndex];
      this.workerIndex = (this.workerIndex + 1) % this.workers.length;
      // LEARNING: Check worker exists and is not closed
      if (worker && !worker.closed) {
        return worker;
      }
    } while (this.workerIndex !== startIndex);

    throw new Error("No healthy workers available");
  }

  /**
   * Get optimized codec configuration
   *
   * LEARNING: Codec selection strategy
   * - Opus: Best audio codec (low latency, high quality)
   * - VP8: Good video codec (widely supported, fast)
   * - H264: Fallback video codec (hardware acceleration)
   */
  getOptimizedCodecs(): CodecOptions {
    return [
      {
        kind: "audio",
        mimeType: "audio/opus",
        preferredPayloadType: 111,
        clockRate: 48000,
        channels: 2,
        parameters: {
          "sprop-stereo": 1,
          useinbandfec: 1, // Forward error correction
        },
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        preferredPayloadType: 96,
        clockRate: 90000,
      },
      {
        kind: "video",
        mimeType: "video/h264",
        preferredPayloadType: 102,
        clockRate: 90000,
        parameters: {
          "packetization-mode": 1,
          "profile-level-id": "42e01f", // baseline profile
        },
      },
    ];
  }

  /**
   * Get router capabilities for client
   *
   * LEARNING: Client needs router capabilities to:
   * 1. Know what codecs are supported
   * 2. Configure its RTP parameters correctly
   * 3. Enable proper header extensions
   */
  getRouterCapabilities(): RouterCapabilities {
    // Return capabilities from first worker's router
    if (this.workers.length === 0) {
      throw new Error("No workers available");
    }

    // We need to create a temporary router to get capabilities
    // In production, you might want to cache this

    /**
     * LEARNING: Header extensions add metadata to RTP packets
     * - ssrc-audio-level: Audio volume indicator
     * - toffset: Transmission time offset
     * - abs-send-time: Absolute send time
     * - video-orientation: Video rotation metadata
     */
    return {
      codecs: this.codecOptions,
      headerExtensions: [
        {
          kind: "audio",
          uri: "urn:ietf:params:rtp-hdrext:ssrc-audio-level",
          preferredId: 1,
          preferredEncrypt: false,
          direction: "sendrecv",
        },
        {
          kind: "video",
          uri: "urn:ietf:params:rtp-hdrext:toffset",
          preferredId: 2,
          preferredEncrypt: false,
          direction: "sendrecv",
        },
        {
          kind: "video",
          uri: "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
          preferredId: 3,
          preferredEncrypt: false,
          direction: "sendrecv",
        },
        {
          kind: "video",
          uri: "urn:3gpp:video-orientation",
          preferredId: 4,
          preferredEncrypt: false,
          direction: "sendrecv",
        },
      ],
    };
  }

  /**
   * Create or get existing room
   *
   * LEARNING: Room creation pattern
   * - Check if room exists (idempotent operation)
   * - Create router on least-loaded worker
   * - Store room in Map for fast lookup
   */
  async createRoom(roomId: string): Promise<Room> {
    // LEARNING: Idempotent - safe to call multiple times
    if (this.rooms.has(roomId)) {
      const existingRoom = this.rooms.get(roomId)!;
      const worker = this.workers[existingRoom.workerIndex];

      if (!existingRoom.router.closed && worker && !worker.closed) {
        return existingRoom;
      }

      this.logger.warn(
        `Room ${roomId} has a closed router/worker; removing stale room before recreating`,
      );
      this.rooms.delete(roomId);
    }
    const worker = this.getNextWorker();

    /**
     * LEARNING: Router is the core MediaSoup object
     * It routes media between producers and consumers
     */
    const router = await worker.createRouter({
      mediaCodecs: this.codecOptions,
    });

    const room: Room = {
      id: roomId,
      router,
      participants: new Map(),
      createdAt: Date.now(),
      workerIndex: this.workers.indexOf(worker),
    };

    this.rooms.set(roomId, room);
    this.logger.info(`Room created: ${roomId} on worker ${room.workerIndex}`);
    return room;
  }

  /**
   * Create WebRTC transport for a user
   *
   * LEARNING: Transport = WebRTC connection
   * - 'send' transport: Client sends media to server
   * - 'recv' transport: Client receives media from server
   * - Each user typically has 2 transports (send + recv)
   */
  async createWebRtcTransport(
    roomId: string,
    userId: string,
    direction: TransportDirection,
  ): Promise<TransportData> {
    try {
      const room = await this.createRoom(roomId);

      // Log the announced IP being used
      /**
       * LEARNING: announcedIp is the public IP clients connect to
       * - Development: 127.0.0.1 (localhost)
       * - Production: Server's public IP
       * - Render: Uses RENDER_EXTERNAL_HOSTNAME
       */
      const announcedIp =
        process.env.ANNOUNCED_IP ||
        process.env.RENDER_EXTERNAL_HOSTNAME ||
        "127.0.0.1";
      this.logger.info(
        `Creating transport with announcedIp: ${announcedIp} for ${direction} direction`,
      );

      /**
       * LEARNING: Transport configuration
       * - listenIps: Server listens on 0.0.0.0 (all interfaces)
       * - announcedIp: Public IP sent to clients
       * - enableUdp/enableTcp: Support both protocols
       * - preferUdp: UDP is faster for real-time media
       * - initialAvailableOutgoingBitrate: 1 Mbps starting bandwidth
       */
      const transportOptions = {
        listenIps: [
          {
            ip: "0.0.0.0",
            announcedIp: announcedIp,
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: 1000000,
        maxSctpMessageSize: 262144,
        appData: { userId, direction },
      };

      const transport =
        await room.router.createWebRtcTransport(transportOptions);

      // Log ICE candidates
      /**
       * LEARNING: ICE candidates are network paths for WebRTC
       * Multiple candidates = multiple ways to connect (fallback)
       */
      this.logger.info(
        `Transport ${transport.id} created with ${transport.iceCandidates.length} ICE candidates`,
      );

      transport.iceCandidates.forEach((candidate, idx) => {
        this.logger.debug(
          `ICE candidate ${idx}: ${candidate.ip}:${candidate.port} (${candidate.protocol})`,
        );
      });

      /**
       * LEARNING: Get or create participant
       * Participant tracks all transports/producers/consumers for a user
       */
      let participant = room.participants.get(userId);
      if (!participant) {
        participant = {
          id: userId,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
          joinedAt: Date.now(),
        };
        room.participants.set(userId, participant);
      }

      participant.transports.set(transport.id, transport);
      /**
       * LEARNING: Return connection parameters to client
       * Client uses these to establish WebRTC connection
       */
      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create WebRTC transport for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create PlainTransport for server-side RTP injection
   * Used by AI streamers to inject audio directly
   *
   * Returns: transport object and RTP port number
   */
  async createPlainTransport(
    roomId: string,
    userId: string,
  ): Promise<{ transport: any; rtpPort: number; rtcpPort: number }> {
    try {
      const room = await this.createRoom(roomId);

      const transport = await room.router.createPlainTransport({
        listenIp: { ip: "0.0.0.0", announcedIp: "127.0.0.1" },
        rtcpMux: false, // separate rtp and rtcp ports,
        comedia: true,
      });

      this.logger.info(
        `PlainTransport created: ${transport.id} - RTP: ${transport.tuple.localPort}, RTCP: ${transport.rtcpTuple?.localPort}`,
      );

      let participant = room.participants.get(userId);
      if (!participant) {
        participant = {
          id: userId,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
          joinedAt: Date.now(),
        };
        room.participants.set(userId, participant);
      }
      participant.transports.set(transport.id, transport);

      return {
        transport,
        rtpPort: transport.tuple.localPort,
        rtcpPort: transport.rtcpTuple?.localPort || 0,
      };
    } catch (error) {
      this.logger.error("Failed to create PlainTransport:", error);
      throw error;
    }
  }

  /**
   * Create producer on PlainTransport for AI audio
   *
   * Returns: Producer object that viewers can consume
   */
  async produceOnPlainTransport(
    roomId: string,
    userId: string,
    transport: any,
    kind: "audio" | "video",
  ): Promise<any> {
    try {
      const room = this.rooms.get(roomId);
      if (!room) throw new Error("Room not found");

      const participant = room.participants.get(userId);
      if (!participant) throw new Error("Participant not found");

      // RTP parameters for Opus audio
      const rtpParameters = {
        codecs: [
          {
            mimeType: "audio/opus",
            clockRate: 48000,
            channels: 2,
            payloadType: 111,
            parameters: {
              "sprop-stereo": 1,
              useinbandfec: 1,
            },
          },
        ],
        encodings: [{ ssrc: Math.floor(Math.random() * 100000000) }],
        rtcp: { cname: `ai-${userId}` },
      };

      // Create producer on PlainTransport
      const producer = await transport.produce({
        kind,
        rtpParameters,
        appData: { userId, kind, isAI: true },
      });

      participant.producers.set(producer.id, producer);

      producer.on("transportclose", () => {
        producer.close();
        participant.producers.delete(producer.id);
      });

      this.logger.info(
        `AI Producer created: ${producer.id} (${kind}) for user ${userId}`,
      );
      return producer;
    } catch (error) {
      this.logger.error("Failed to create AI producer:", error);
      throw error;
    }
  }

  /**
   * Connect a transport with DTLS parameters
   *
   * LEARNING: Two-phase transport setup
   * 1. createWebRtcTransport: Create transport, get parameters
   * 2. connectTransport: Client sends its DTLS parameters
   * This completes the WebRTC handshake
   */
  async connectTransport(
    roomId: string,
    userId: string,
    transportId: string,
    dtlsParameters: DtlsParameters,
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    const participant = room.participants.get(userId);
    if (!participant) throw new Error("Participant not found");

    const transport = participant.transports.get(transportId);
    if (!transport) throw new Error("Transport not found");

    /**
     * LEARNING: connect() completes the DTLS handshake
     * After this, transport is ready to send/receive media
     */
    await transport.connect({ dtlsParameters });
    this.logger.info(`Transport connected: ${transportId} for user ${userId}`);
  }

  /**
   * Create a producer (media source)
   *
   * LEARNING: Producer = media stream from client
   * - kind: 'audio' or 'video'
   * - isScreenShare: true for screen sharing, false for camera
   * - rtpParameters: Codec, bitrate, etc. from client
   */
  async produce(
    roomId: string,
    userId: string,
    transportId: string,
    rtpParameters: RtpParameters,
    kind: MediaKind,
    isScreenShare = false,
  ): Promise<ProducerData> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    const participant = room.participants.get(userId);
    if (!participant) throw new Error("Participant not found");

    const transport = participant.transports.get(transportId);
    if (!transport) throw new Error("Transport not found");

    /**
     * LEARNING: Create producer on send transport
     * Producer represents one media track (audio OR video)
     */
    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { userId, kind, isScreenShare },
    });

    participant.producers.set(producer.id, producer);

    /**
     * LEARNING: Event handlers for cleanup
     * - transportclose: Transport died, close producer
     * - Prevents memory leaks
     */
    producer.on("transportclose", () => {
      producer.close();
      participant.producers.delete(producer.id);
    });

    this.logger.info(
      `Producer created: ${producer.id} (${kind}) for user ${userId} ${isScreenShare ? "[SCREEN]" : "[CAMERA]"}`,
    );
    return producer;
  }

  /**
   * Create a consumer (media sink)
   *
   * LEARNING: Consumer = receive media from a producer
   * - Viewer creates consumer to watch streamer's producer
   * - Router checks if viewer's device can decode the codec
   * - Consumer starts paused, must call resumeConsumer()
   */
  async consume(
    roomId: string,
    userId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities,
  ): Promise<ConsumerData> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    const participant = room.participants.get(userId);
    if (!participant) throw new Error("Participant not found");

    /**
     * LEARNING: Find producer across all participants
     * Producer might belong to different user (streamer)
     */
    let producer: Producer | null = null;
    for (const p of room.participants.values()) {
      if (p.producers.has(producerId)) {
        producer = p.producers.get(producerId)!;
        break;
      }
    }

    if (!producer) {
      throw new Error("Producer not found");
    }

    /**
     * LEARNING: Check if consumer can decode producer's codec
     * Prevents creating consumer that can't play media
     */
    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error("Cannot consume this producer");
    }

    // find recv transport for this participant
    /**
     * LEARNING: Find recv transport for this participant
     * Consumer must be created on recv transport
     */
    let recvTransport: WebRtcTransport | null = null;
    for (const transport of participant.transports.values()) {
      if (transport.appData.direction === "recv") {
        recvTransport = transport;
        break;
      }
    }

    if (!recvTransport) {
      throw new Error("No receive transport found");
    }

    /**
     * LEARNING: Create consumer (paused by default)
     * Paused = no media sent yet (saves bandwidth)
     * Client must call resumeConsumer() to start receiving
     */
    const consumer = await recvTransport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
      appData: { userId, producerId },
    });

    participant.consumers.set(consumer.id, consumer);

    /**
     * LEARNING: Event handlers for cleanup
     * - transportclose: Transport died
     * - producerclose: Producer stopped (streamer left)
     */
    consumer.on("transportclose", () => {
      consumer.close();
      participant.consumers.delete(consumer.id);
    });

    consumer.on("producerclose", () => {
      consumer.close();
      participant.consumers.delete(consumer.id);
    });

    this.logger.info(`Consumer created: ${consumer.id} for user ${userId}`);

    return {
      id: consumer.id,
      kind: consumer.kind as MediaKindType,
      rtpParameters: consumer.rtpParameters,
      producerId: consumer.producerId,
    };
  }

  /**
   * Resume a paused consumer
   *
   * LEARNING: Two-step consumer activation
   * 1. consume(): Create consumer (paused)
   * 2. resumeConsumer(): Start receiving media
   * This prevents media flowing before client is ready
   */
  async resumeConsumer(
    roomId: string,
    userId: string,
    consumerId: string,
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    const participant = room.participants.get(userId);
    if (!participant) throw new Error("Participant not found");

    const consumer = participant.consumers.get(consumerId);
    if (!consumer) throw new Error("Consumer not found");

    /**
     * LEARNING: Resume consumer and request keyframe
     * - resume(): Start sending media
     * - requestKeyFrame(): Request I-frame for instant playback
     */
    await consumer.resume();
    await consumer.requestKeyFrame();
    this.logger.info(`Consumer resumed: ${consumerId} for user ${userId}`);
  }

  /**
   * Close participant and cleanup resources
   *
   * LEARNING: Graceful cleanup when user leaves
   * - Close all producers (stop sending media)
   * - Close all consumers (stop receiving media)
   * - Close all transports (close WebRTC connections)
   * - Remove participant from room
   * - Close room if empty
   */
  async closeParticipant(roomId: string, userId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const participant = room.participants.get(userId);
    if (!participant) return;

    /**
     * LEARNING: Close producers first (stop broadcasting)
     */
    for (const producer of participant.producers.values()) {
      producer.close();
    }

    /**
     * LEARNING: Close consumers (stop receiving)
     */
    for (const consumer of participant.consumers.values()) {
      consumer.close();
    }

    /**
     * LEARNING: Close transports (close WebRTC connections)
     * Try-catch because transport might already be closed
     */
    for (const transport of participant.transports.values()) {
      try {
        transport.close();
      } catch (e) {
        /* already closed */
      }
    }

    room.participants.delete(userId);
    this.logger.info(`Participant ${userId} removed from room ${roomId}`);

    /**
     * LEARNING: Close empty rooms to free resources
     * Router consumes memory even when idle
     */
    if (room.participants.size === 0) {
      room.router.close();
      this.rooms.delete(roomId);
      this.logger.info(`Room ${roomId} closed (empty)`);
    }
  }

  /**
   * Cleanup all resources on shutdown
   *
   * LEARNING: Graceful shutdown pattern
   * - Close all routers (stops all media)
   * - Close all workers (stops all processes)
   * - Clear data structures
   */
  async cleanup(): Promise<void> {
    this.logger.info("Cleaning up MediaService...");

    // Close all rooms
    for (const room of this.rooms.values()) {
      try {
        room.router.close();
      } catch (error) {
        this.logger.error("Error closing router:", error);
      }
    }
    this.rooms.clear();

    // Close all workers
    for (const worker of this.workers) {
      try {
        if (worker) worker.close();
      } catch (error) {
        this.logger.error("Error closing worker:", error);
      }
    }
    this.workers = [];
  }

  // for statistics - future use
  /**
   * Get statistics for a room
   *
   * LEARNING: Monitoring and debugging helper
   */
  getRoomStats(roomId: string): RoomStats | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    return {
      id: roomId,
      participants: room.participants.size,
      createdAt: room.createdAt,
      uptime: Date.now() - room.createdAt,
      workerIndex: room.workerIndex,
    };
  }

  getAllRoomStats(): RoomStats[] {
    const stats: RoomStats[] = [];
    for (const [roomId] of this.rooms) {
      const roomStats = this.getRoomStats(roomId);
      if (roomStats) stats.push(roomStats);
    }
    return stats;
  }
}

export default MediaService;

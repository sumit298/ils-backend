const mediasoup = require('mediasoup');
const os = require('os');

class MediaService {
    constructor(logger) {
        this.logger = logger;
        this.workers = [];
        this.workerIndex = 0;
        this.rooms = new Map();
        this.maxConsumersPerRouter = 400;
        this.codecOptions = this.getOptimizedCodecs();
    }

    async initialize() {
        const numWorkers = Math.min(os.cpus().length, 8);
        this.logger.info(`Creating ${numWorkers} mediasoup workers`);

        for (let i = 0; i < numWorkers; i++) {
            await this.createWorker(i);
        }

        this.logger.info(`Mediasoup initialized with ${this.workers.length} workers`);

    }

    async createWorker(index) {
        try {
            const worker = await mediasoup.createWorker({
                logLevel: 'error',
                rtcMinPort: 2000 + (index * 1000),
                rtcMaxPort: 2000 + (index * 1000) + 999,
                appData: { workerId: index }
            });

            worker.on('died', async () => {
                this.logger.error(`Worker ${index} died, respawning...`);
                await this.respawnWorker(index);
            });

            this.workers[index] = worker;
            return worker;
        } catch (error) {
            this.logger.error(`Failed to create worker ${index}:`, error);
            throw error;
        }
    }

    async respawnWorker(index) {
        try {
            if (this.workers[index]) {
                this.workers[index].close();

            }
            await this.createWorker(index);

            this.logger.info(`Worker ${index} respawned successfully`);
        } catch (error) {
            this.logger.error(`Failed to respawn worker ${index}:`, error);
        }
    }

    getNextWorker() {
        const worker = this.workers[this.workerIndex];
        this.workerIndex = (this.workerIndex + 1) % this.workers.length;
        return worker;
    }

    getOptimizedCodecs() {
        return [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                preferredPayloadType: 111,
                clockRate: 48000,
                channels: 2,
                parameters: {
                    'sprop-stereo': 1,
                    'useinbandfec': 1
                }
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                preferredPayloadType: 96,
                clockRate: 90000
            },
            {
                kind: 'video',
                mimeType: 'video/h264',
                preferredPayloadType: 102,
                clockRate: 90000,
                parameters: {
                    'packetization-mode': 1,
                    'profile-level-id': '42e01f'
                }
            }
        ];
    }

    getRouterCapabilities() {
        // Return capabilities from first worker's router
        if (this.workers.length === 0) {
            throw new Error('No workers available');
        }

        // We need to create a temporary router to get capabilities
        // In production, you might want to cache this
        return {
            codecs: this.codecOptions,
            headerExtensions: [
                {
                    kind: 'audio',
                    uri: 'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
                    preferredId: 1,
                    preferredEncrypt: false,
                    direction: 'sendrecv'
                },
                {
                    kind: 'video',
                    uri: 'urn:ietf:params:rtp-hdrext:toffset',
                    preferredId: 2,
                    preferredEncrypt: false,
                    direction: 'sendrecv'
                },
                {
                    kind: 'video',
                    uri: 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
                    preferredId: 3,
                    preferredEncrypt: false,
                    direction: 'sendrecv'
                },
                {
                    kind: 'video',
                    uri: 'urn:3gpp:video-orientation',
                    preferredId: 4,
                    preferredEncrypt: false,
                    direction: 'sendrecv'
                }
            ]
        };
    }

    async createRoom(roomId) {
        if (this.rooms.has(roomId)) {
            return this.rooms.get(roomId)
        }
        const worker = this.getNextWorker();
        const router = await worker.createRouter({
            mediaCodecs: this.codecOptions
        })

        const room = {
            id: roomId,
            router,
            participants: new Map(),
            createdAt: Date.now(),
            workerIndex: this.workers.indexOf(worker)
        }

        this.rooms.set(roomId, room);
        this.logger.info(`Room created: ${roomId} on worker ${room.workerIndex}`);
        return room;
    }

    async createWebRtcTransport(roomId, userId, direction) {
        try {
            const room = await this.createRoom(roomId);
            const transportOptions = {
                listenIps: [
                    {
                        ip: '0.0.0.0',
                        announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1'
                    }
                ],
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
                initialAvailableOutgoingBitrate: 1000000,
                maxSctpMessageSize: 262144,
                appData: { userId, direction }
            };

            const transport = await room.router.createWebRtcTransport(transportOptions);

            let participant = room.participants.get(userId);
            if (!participant) {
                participant = {
                    id: userId,
                    transports: new Map(),
                    producers: new Map(),
                    consumers: new Map(),
                    joinedAt: Date.now()
                };
                room.participants.set(userId, participant);
            }

            participant.transports.set(transport.id, transport);
            return {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters
            };
        } catch (error) {
            this.logger.error(`Failed to create WebRTC transport for user ${userId}:`, error);
            throw error;
        }
    }

    async connectTransport(roomId, userId, transportId, dtlsParameters) {
        const room = this.rooms.get(roomId)
        if (!room) throw new Error('Room not found')

        const participant = room.participants.get(userId);
        if (!participant) throw new Error('Participant not found')

        const transport = participant.transports.get(transportId);
        if (!transport) throw new Error('Transport not found')

        await transport.connect({ dtlsParameters });
        this.logger.info(`Transport connected: ${transportId} for the ${userId}`);

    }

    async produce(roomId, userId, transportId, rtpParameters, kind) {
        const room = this.rooms.get(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        const participant = room.participants.get(userId);
        if (!participant) throw new Error('Participant not found');

        const transport = participant.transports.get(transportId);
        if (!transport) throw new Error('Transport not found');


        const producer = await transport.produce({
            kind,
            rtpParameters,
            appData: { userId, kind }
        })

        participant.producers.set(producer.id, producer);

        producer.on('transportclose', () => {
            producer.close();
            participant.producers.delete(producer.id)
        })

        this.logger.info(`Producer created: ${producer.id} (${kind}) for user ${userId}`);
        return producer;
    }

    async consume(roomId, userId, producerId, rtpCapabilities) {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found')

        const participant = room.participants.get(userId);
        if (!participant) throw new Error('Participant not found')

        let producer = null;
        for (const p of room.participants.values()) {
            if (p.producers.has(producerId)) {
                producer = p.producers.get(producerId);
                break;
            }
        }

        if (!producer) {
            throw new Error('Producer not found')
        }

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
            throw new Error('Cannot consume this producer')
        }

        // find recv transport for this participant
        let recvTransport = null;
        for (const transport of participant.transports.values()) {
            if (transport.appData.direction === 'recv') {
                recvTransport = transport;
                break;
            }
        }

        if (!recvTransport) {
            throw new Error('No receive transport found');
        }

        const consumer = await recvTransport.consume({
            producerId,
            rtpCapabilities,
            paused: true,
            appData: { userId, producerId }
        })

        participant.consumers.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
            consumer.close();
            participant.consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
            consumer.close();
            participant.consumers.delete(consumer.id);
        });

        this.logger.info(`Consumer created: ${consumer.id} for user ${userId}`);

        return {
            id: consumer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            producerId: consumer.producerId
        }
    }

    async resumeConsumer(roomId, userId, consumerId) {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');

        const participant = room.participants.get(userId);
        if (!participant) throw new Error('Participant not found')

        const consumer = participant.consumers.get(consumerId);
        if (!consumer) throw new Error('Consumer not found')

        await consumer.resume();
        this.logger.info(`Consumer resumed: ${consumerId} for user ${userId}`);


    }

    async closeParticipant(roomId, userId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const participant = room.participants.get(userId);
        if (!participant) return;

        for (const transport of participant.transports.values()) {
            transport.close();
        }

        room.participants.delete(userId);
        this.logger.info(`Participant ${userId} removed from room ${roomId}`);

        if (room.participants.size === 0) {
            room.router.close();
            this.rooms.delete(roomId);
            this.logger.info(`Room ${roomId} closed (empty)`);
        }


    }


    async cleanup() {
        this.logger.info('Cleaning up MediaService...');

        // Close all rooms
        for (const room of this.rooms.values()) {
            try {
                room.router.close();
            } catch (error) {
                this.logger.error('Error closing router:', error);
            }
        }
        this.rooms.clear();

        // Close all workers
        for (const worker of this.workers) {
            try {
                worker.close();
            } catch (error) {
                this.logger.error('Error closing worker:', error);
            }
        }
        this.workers = [];
    }

    // for statistics - future use
    getRoomStats(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        return {
            id: roomId,
            participants: room.participants.size,
            createdAt: room.createdAt,
            uptime: Date.now() - room.createdAt,
            workerIndex: room.workerIndex
        }
    }

    getAllRoomStats() {
        const stats = []
        for (const [roomId, room] of this.rooms) {
            stats.push(this.getRoomStats(roomId))
        }
        return stats;
    }

}

module.exports = MediaService;
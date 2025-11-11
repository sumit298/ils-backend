const { v4: uuidv4 } = require('uuid');
const { Stream } = require('../models');


class StreamService {
    constructor(mediaService, messageQueue, cacheService, logger) {
        this.mediaService = mediaService;
        this.messageQueue = messageQueue;
        this.cacheService = cacheService;
        this.logger = logger;

    }

    async createStream(userId, streamData) {
        try {
            const streamId = uuidv4();
            const stream = {
                id: streamId,
                userId,
                title: streamData.title,
                description: streamData.description || '',
                category: streamData.category || 'general',
                isLive: false,
                isPrivate: streamData.isPrivate || false,
                chatEnabled: streamData.chatEnabled !== false,
                recordingEnabled: streamData.recordingEnabled || false,
                stats: {
                    viewers: 0,
                    maxViewers: 0,
                    totalViews: 0,
                    chatMessages: 0,
                    likes: 0,
                    shares: 0
                }
            }

            await this.mediaService.createRoom(streamId);

            // Cache service disabled for testing
            if (this.cacheService) {
                // await this.cacheService.updateStream(streamId, stream);
            }

            // Store in database first
            try {
                const streamDoc = new Stream(stream);
                await streamDoc.save();
                this.logger.info(`Stream saved to database: ${streamId}`);
            } catch (dbError) {
                this.logger.error('Database save failed:', dbError);
                throw new Error('Failed to save stream to database');
            }

            // Message queue disabled for testing
            if (this.messageQueue) {
                // await this.messageQueue.publishStreamEvent('create', stream);
            }
            
            this.logger.info(`Stream created: ${streamId} by user ${userId}`);
            return stream;
        } catch (error) {
            this.logger.error('Error creating stream:', error);
            throw error;
        }
    }

    async joinStream(userId, streamId) {
        try {
            let stream = null;
            
            // Get stream from database since cache is disabled
            try {
                const streamDoc = await Stream.findOne({ id: streamId });
                if (streamDoc) {
                    stream = streamDoc.toObject();
                }
            } catch (dbError) {
                this.logger.warn('Database query failed:', dbError)
            }

            if (!stream) {
                throw new Error('Stream not found');
            }

            if (stream.isPrivate && stream.userId !== userId) {
                throw new Error('This is a private stream');
            }

            // Cache and message queue disabled for testing
            let viewersCount = 1;
            let messages = [];
            let stats = { viewers: 1, views: 1, chatCount: 0 };
            
            if (this.cacheService) {
                // viewersCount = await this.cacheService.addViewer(streamId, userId);
                // await this.cacheService.incrementStreamView(streamId);
                // messages = await this.cacheService.getChatMessages(streamId);
                // stats = await this.cacheService.getStreamStats(streamId);
            }
            
            if (this.messageQueue) {
                // await this.messageQueue.publishUserPresence('joined', {
                //     userId,
                //     streamId,
                //     timestamp: Date.now()
                // })
                // await this.messageQueue.publishAnalyticsEvent('stream.view', {
                //     streamId,
                //     userId,
                //     timestamp: Date.now()
                // });
            }

            this.logger.info(`User ${userId} joined stream ${streamId}`);
            return {
                stream,
                viewers: viewersCount,
                messages,
                stats
            };
        } catch (error) {
            this.logger.error('Error joining stream:', error);
            throw error;
        }
    }

    async createTransport(roomId, userId, direction) {
        try {
            if (!['send', 'recv'].includes(direction)) {
                throw new Error('Invalid transport direction');
            }

            const transportData = await this.mediaService.createWebRtcTransport(roomId, userId, direction)

            this.logger.debug(`Transport created: ${transportData.id} (${direction}) for user ${userId}`);
            return transportData;
        } catch (error) {
            this.logger.error('Error creating transport:', error);
            throw error;
        }
    }

    async connectTransport(roomId, userId, transportId, dtlsParameters) {
        try {
            await this.mediaService.connectTransport(roomId, userId, transportId, dtlsParameters);
            this.logger.debug(`Transport connected: ${transportId} for user ${userId}`);
        } catch (error) {
            this.logger.error('Error connecting transport:', error);
            throw error;
        }
    }

    async produce(roomId, userId, transportId, rtpParameters, kind) {
        try {
            const producer = await this.mediaService.produce(roomId, userId, transportId, rtpParameters, kind);

            // Update database to mark stream as live
            try {
                await Stream.updateOne({ id: roomId }, {
                    isLive: true,
                    startedAt: new Date(),
                })
            } catch (dbError) {
                this.logger.warn('Database update failed:', dbError);
            }

            // Cache and message queue disabled for testing
            if (this.messageQueue) {
                // await this.messageQueue.publishStreamEvent('started', {
                //     streamId: roomId,
                //     userId,
                //     timestamp: Date.now()
                // })
                // await this.messageQueue.publishAnalyticsEvent('producer.created', {
                //     streamId: roomId,
                //     userId,
                //     kind,
                //     producerId: producer.id,
                //     timestamp: Date.now()
                // })
            }

            this.logger.info(`Producer Created ${producer.id} (${kind}) for user ${userId}`)
            return producer;
        } catch (error) {
            this.logger.error('Error creating producer:', error);
            throw error
        }
    }

    async consume(roomId, userId, producerId, rtcCapabilities) {
        try {
            const consumerData = await this.mediaService.consume(roomId, userId, producerId, rtcCapabilities);

            // Message queue disabled for testing
            if (this.messageQueue) {
                // await this.messageQueue.publishAnalyticsEvent('consumer.created', {
                //     streamId: roomId,
                //     userId,
                //     producerId,
                //     consumerId: consumerData.id,
                //     timestamp: Date.now()
                // })
            }

            this.logger.debug(`Consumer created: ${consumerData.id} for user ${userId}`);
            return consumerData;
        } catch (error) {
            this.logger.error('Error creating consumer', error);
            throw error;
        }
    }

    async resumeConsumer(roomId, userId, consumerId) {
        try {
            await this.mediaService.resumeConsumer(roomId, userId, consumerId);
            this.logger.debug(`Consumer resumed: ${consumerId} for user ${userId}`);

        } catch (error) {
            this.logger.error('Error resuming consumer:', error);
            throw error;
        }
    }

    async endStream(streamId, userId) {
        try {
            let stream = null;
            let finalStats = { maxViewers: 0, views: 0, chatMessages: 0 };

            // Get stream from cache or database
            if (this.cacheService) {
                stream = await this.cacheService.getStream(streamId);
                finalStats = await this.cacheService.getStreamStats(streamId);
            }

            if (!stream) {
                const streamDoc = await Stream.findOne({ id: streamId });
                if (streamDoc) {
                    stream = streamDoc.toObject();
                } else {
                    throw new Error('Stream not found');
                }
            }

            await this.mediaService.closeParticipant(streamId, userId);

            const streamUpdate = {
                isLive: false,
                endedAt: new Date().toISOString(),
                duration: stream.startedAt ? Date.now() - new Date(stream.startedAt).getTime() : 0,
                maxViewers: finalStats.maxViewers || 0,
                totalViews: finalStats.views || 0,
                totalChatMessages: finalStats.chatMessages || 0
            }

            if (this.cacheService) {
                await this.cacheService.updateStream(streamId, streamUpdate);
            }

            // update database
            try {
                await Stream.updateOne({ id: streamId }, {
                    ...streamUpdate,
                    endedAt: new Date(),
                    duration: streamUpdate.duration
                })
            } catch (dbError) {
                this.logger.warn('Database update failed:', dbError);
            }

            // Message queue disabled for testing
            if (this.messageQueue) {
                // await this.messageQueue.publishStreamEvent('ended', {
                //     streamId,
                //     userId,
                //     duration: streamUpdate.duration,
                //     maxViewers: finalStats.maxViewers,
                //     totalViews: finalStats.views,
                //     timestamp: Date.now()
                // })
                // await this.messageQueue.publishAnalyticsEvent('stream.ended', {
                //     streamId,
                //     userId,
                //     ...finalStats,
                //     duration: streamUpdate.duration,
                //     timestamp: Date.now()
                // })
            }

            this.logger.info(`Stream ended: ${streamId} by user ${userId}`);

            // Clean up cache after delay (allow viewers to see end message)
            if (this.cacheService) {
                setTimeout(async () => {
                    await this.cacheService.deleteStream(streamId);
                }, 30000); // 30 seconds
            }

            return streamUpdate;

        } catch (error) {
            this.logger.error('Error ending stream:', error);
            throw error;
        }
    }

    async handleUserDisconnect(streamId, userId) {
        try {
            // Cache service disabled for testing
            if (this.cacheService) {
                // await this.cacheService.removeViewer(streamId, userId);
            }

            await this.mediaService.closeParticipant(streamId, userId);

            // Message queue disabled for testing
            if (this.messageQueue) {
                // await this.messageQueue.publishUserPresence('left', {
                //     userId,
                //     streamId,
                //     timestamp: Date.now()
                // })
            }

            this.logger.debug(`User ${userId} disconnected from stream ${streamId}`)
        } catch (error) {
            this.logger.error('Error handling user disconnect', error);
        }
    }

    async getStreamInfo(streamId) {
        try {
            let stream = await this.cacheService.getStream(streamId);

            if (!stream) {
                try {
                    const streamDoc = await Stream.findOne({ id: streamId });
                    if (streamDoc) {
                        stream = streamDoc.toObject();
                        await this.cacheService.updateStream(streamId, stream);
                    }
                } catch (dbError) {
                    this.logger.warn('Database query failed:', dbError)
                }
            }

            if (!stream) {
                return null;
            }

            const stats = await this.cacheService.getStreamStats(streamId);
            const mediaStats = await this.mediaService.getRoomStats(streamId);

            return {
                ...stream,
                ...stats,
                mediaStats
            };
        } catch (error) {
            this.logger.error("Error getting stream info", error);
            throw error;
        }
    }

    async getActiveStreams() {
        try {

            // stuff of redis

            const activeStreamIds = await this.cacheService.client.smembers('active:streams');
            const streams = [];

            for (const streamId of activeStreamIds) {
                const streamInfo = await this.getStreamInfo(streamId);
                if (streamInfo && streamInfo.isLive) {
                    streams.push(streamInfo);
                }
            }

            return streams.sort((a, b) => b.viewers - a.viewers);
        } catch (error) {
            this.logger.error(`Error getting active streams:`, error);
            return []
        }
    }

    async searchStreams(query, limit = 20) {
        try {
            // This would typically use a search engine like Elasticsearch
            // For now, we'll do a simple database search
            const streams = await Stream.find({
                $or: [
                    { title: { $regex: query, $options: 'i' } },
                    { description: { $regex: query, $options: 'i' } },
                    { category: { $regex: query, $options: 'i' } }
                ],
                isLive: true
            }).limit(limit).sort({ createdAt: -1 });

            // Enhance with real-time data
            const enhancedStreams = [];
            for (const stream of streams) {
                const stats = await this.cacheService.getStreamStats(stream.id);
                enhancedStreams.push({
                    ...stream.toObject(),
                    ...stats
                });
            }

            return enhancedStreams;
        } catch (error) {
            this.logger.error('Error searching streams:', error);
            return [];
        }
    }

    async getUserActiveStreams(userId) {
        try {
            return await Stream.find({ userId, isLive: true });
        } catch (error) {
            this.logger.error('Error getting user active streams:', error);
            return [];
        }
    }

    async updateStream(streamId, updateData) {
        try {
            await this.cacheService.updateStream(streamId, updateData);
            await Stream.updateOne({ id: streamId }, updateData);
            return await this.getStreamInfo(streamId);
        } catch (error) {
            this.logger.error('Error updating stream:', error);
            throw error;
        }
    }

    async getDetailedStats(streamId) {
        try {
            return await this.cacheService.getStreamStats(streamId);
        } catch (error) {
            this.logger.error('Error getting detailed stats:', error);
            return {};
        }
    }

    async getUserStreams(userId, options = {}) {
        try {
            const query = { userId };
            if (!options.includeEnded) {
                query.isLive = true;
            }
            return await Stream.find(query).limit(options.limit || 20).sort({ createdAt: -1 });
        } catch (error) {
            this.logger.error('Error getting user streams:', error);
            return [];
        }
    }
}


module.exports = StreamService;
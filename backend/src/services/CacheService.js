const Redis = require('ioredis');

class CacheService {
    constructor(logger) {
        this.logger = logger;
        this.client = null;
        this.publisher = null;
        this.subscriber = null;
    }

    async connect() {
        try {
            const redisConfig = {
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD,
                db: process.env.REDIS_DB || 0,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                lazyConnect: false,
                keepAlive: 30000,
                connectTimeout: 10000,
                commandTimeout: 5000,
                family: 4
            }

            this.client = new Redis(redisConfig);
            this.publisher = new Redis(redisConfig);
            this.subscriber = new Redis(redisConfig);

            // error handling
            this.client.on('error', (error) => {
                this.logger.error(`Redis client error: ${error.message}`, { error });
            })

            this.client.on('connect', () => {
                this.logger.info('Redis client connected');
            })

            this.client.on('ready', () => {
                this.logger.info('Redis client ready');
            })

            this.publisher.on('error', (err) => {
                this.logger.error('Redis Publisher Error:', err);
            });

            this.subscriber.on('error', (err) => {
                this.logger.error('Redis Subscriber Error:', err);
            });

            await this.client.ping()
            this.logger.info('Redis connected successfully');
        } catch (error) {
            this.logger.error('Redis connection failed:', error);
            throw error;
        }
    }

    async setUserSession(userId, sessionData, ttl = 86400) {
        try {
            const key = `session:user:${userId}`;

            // Redis pipelining is a technique for improving performance by issuing multiple commands at once without waiting for the response to each individual command. 
            const pipeline = this.client.pipeline();

            for (const [field, value] of Object.entries(sessionData)) {
                pipeline.hset(key, field, JSON.stringify(value));
            }

            pipeline.expire(key, ttl);
            await pipeline.exec();

            this.logger.debug(`User session set: ${userId}`)


        } catch (error) {
            this.logger.error(`Error setting user session: ${error.message}`, { error });
            throw error;
        }
    }

    async getUserSession(userId) {
        try {
            const key = `session:user:${userId}`;
            const sessionData = await this.client.hgetall(key);  //all the contents of the hash

            const parsed = {}
            for (const [field, value] of Object.entries(sessionData)) {
                try {
                    parsed[field] = JSON.parse(value);
                } catch (error) {
                    parsed[field] = value;
                }
            }
            return parsed;

        } catch (error) {
            this.logger.error(`Error getting user session: ${error.message}`, { error });
            return {}
        }
    }

    async deleteUserSession(userId) {
        try {
            await this.client.del(`session:user:${userId}`);
            this.logger.debug(`User session deleted: ${userId}`)
        } catch (error) {
            this.logger.error(`Error deleting user session: ${error.message}`, { error });
        }
    }

    //stream Management
    async getStream(streamId) {
        try {
            const key = `stream:${streamId}`;
            const streamData = await this.client.hgetall(key);
            if (!streamData || Object.keys(streamData).length === 0) {
                return null;
            }

            const parsed = {};
            for (const [field, value] of Object.entries(streamData)) {
                try {
                    parsed[field] = JSON.parse(value);
                } catch (error) {
                    parsed[field] = value;
                }
            }

            return parsed;
        } catch (error) {
            this.logger.error('Error getting stream', error);
            return null;
        }

    }

    async updateStream(streamId, streamData) {
        try {
            const key = `stream:${streamId}`;
            const pipeline = this.client.pipeline();

            for (const [field, value] of Object.entries(streamData)) {
                pipeline.hset(key, field, JSON.stringify(value));
            }

            await pipeline.exec();
            this.logger.debug(`Stream updated: ${streamId}`)
        } catch (error) {
            this.logger.error('Error updating stream', error);
            throw error;
        }
    }

    async deleteStream(streamId) {
        try {
            const pipeline = this.client.pipeline();

            pipeline.del(`stream:${streamId}`);
            pipeline.del(`stream:${streamId}:viewers`);
            pipeline.del(`stream:${streamId}:chat`);
            pipeline.del(`stream:${streamId}:stats`);
            pipeline.srem('active:streams', streamId);

            await pipeline.exec();
            this.logger.debug(`Stream deleted, ${streamId}`)
        } catch (error) {
            this.logger.error('Error deleting stream', error);
        }
    }

    async addViewer(streamId, userId) {
        try {
            const pipeline = this.client.pipeline();
            pipeline.sadd(`stream:${streamId}:viewers`, userId);  //set add
            pipeline.hincrby(`stream:${streamId}:stats`, 'totalViews', 1);

            const result = await pipeline.exec();
            const count = await this.client.scard(`stream:${streamId}:viewers`);

            // update max viewers if needed
            const maxViewers = await this.client.hget(`stream:${streamId}:stats`, 'maxViewers') || 0;
            if (count > parseInt(maxViewers)) {
                await this.client.hset(`stream:${streamId}:stats`, 'maxViewers', count);
            }

            await this.publisher.publish('viewer.count', JSON.stringify({ streamId, count, action: 'joined', userId, timestamp: Date.now() }));

            this.logger.debug(`Viewer added to stream: ${streamId}, ${userId}`
            )
            return count;
        } catch (error) {
            this.logger.error('Error adding viewer to stream', error);
            throw error;
        }
    }

    async removeViewer(streamId, userId) {
        try {
            await this.client.srem(`stream:${streamId}:viewers`, userId);
            const count = await this.client.scard(`stream:${streamId}:viewers`);

            // publish viewer count update
            await this.publisher.publish('viewer.count', JSON.stringify({
                streamId,
                count,
                action: 'left',
                userId,
                timestamp: Date.now()
            }))

            this.logger.debug(`Viewer removed: ${userId} from stream ${streamId}`);
            return count;
        } catch (error) {
            this.logger.error('Error removing viewer from stream', error);
            return 0;
        }
    }

    async getViewers(streamId) {
        try {
            return await this.client.smembers(`stream:${streamId}:viewers`);
        } catch (error) {
            this.logger.error('Error getting viewers', error);
            return [];
        }
    }

    async getViewerCount(streamId) {
        try {
            return await this.client.scard(`stream:${streamId}:viewers`);
        } catch (error) {
            this.logger.error('Error getting viewer count:', error);
            return 0;
        }
    }

    async addChatMessage(streamId, message, maxMessage = 100) {
        try {
            const key = `stream:${streamId}:chat`;
            const pipeline = this.client.pipeline();

            pipeline.lpush(key, JSON.stringify(message));
            pipeline.ltrim(key, 0, maxMessage - 1);
            pipeline.expire(key, 86400);
            pipeline.hincrby(`stream:${streamId}:stats`, 'chatMessages', 1);

            await pipeline.exec();
            this.logger.debug(`Chat message added to stream: ${streamId}`)
        } catch (error) {
            this.logger.error(`Error adding chat message`, error);
            throw error;

        }
    }

    async getChatMessages(streamId, limit = 50) {
        try {
            const messages = await this.client.lrange(`stream:${streamId}:chat`, 0, limit - 1);
            return messages.map(msg => {
                try {
                    return JSON.parse(msg);
                } catch (error) {
                    return { content: msg, timestamp: Date.now() }
                }
            }).reverse();
        } catch (error) {
            this.logger.error('Error getting chat messages', error);
            return []
        }
    }

    async incrementStreamView(streamId) {
        try {
            await this.client.hincrby(`analytics:views:${streamId}`, 'count', 1);
            await this.client.hincrby(`analytics:views:${streamId}`, 'daily:' + new Date().toISOString().split('T')[0], 1);
            await this.client.expire(`analytics:views:${streamId}`, 604800); // 7 days
        } catch (error) {
            this.logger.error('Error incrementing stream view:', error);
        }
    }

    async getStreamStats(streamId) {
        try {
            const [viewers, views, chatCount, stats] = await Promise.all([
                this.client.scard(`stream:${streamId}:viewers`),
                this.client.hget(`analytics:views:${streamId}`, 'count') || 0,
                this.client.llen(`stream:${streamId}:chat`),
                this.client.hgetall(`stream:${streamId}:stats`)
            ]);

            return {
                viewers: parseInt(viewers),
                views: parseInt(views),
                chatCount: parseInt(chatCount),
                ...stats
            };
        } catch (error) {
            this.logger.error('Error getting stream stats:', error);
            return { viewers: 0, views: 0, chatCount: 0 };
        }
    }

    // Rate Limit
    async checkRateLimit(key, limit, windowMs) {
        try {
            const current = await this.client.incr(key);
            if (current === 1) {
                await this.client.expire(key, Math.ceil(windowMs / 1000));
            }
            return current <= limit;
        } catch (error) {
            this.logger.error('Error checking rate limit:', error);
            return false;
        }
    }

    async subscribe(pattern, callback) {
        try {
            if (typeof callback !== "function") {
                throw new Error("Callback must be a function");
            }

            
            // Remove existing listeners to prevent duplicates
            this.subscriber.removeAllListeners('pmessage');
            await this.subscriber.psubscribe(pattern);
            this.subscriber.on('pmessage', (pattern, channel, message) => {
                try {
                    const data = JSON.parse(message);
                    callback(channel, data);
                } catch (error) {
                    this.logger.error('Error parsing pub/sub message:', error);
                }
            });

            this.logger.debug(`Subscribed to pattern: ${pattern}`);
        } catch (error) {
            this.logger.error('Error subscribing:', error);
        }
    }

    async publish(channel, data) {
        try {
            await this.publisher.publish(channel, JSON.stringify(data));
            this.logger.debug(`Published to channel: ${channel}`);
        } catch (error) {
            this.logger.error('Error publishing:', error);
        }
    }

    async disconnect() {
        try {
            await this.client.disconnect();
            await this.publisher.disconnect();
            await this.subscriber.disconnect();
            this.logger.info('Redis disconnected')
        } catch (error) {
            this.logger.error('Error disconnecting redis', error);
        }
    }

}

module.exports = CacheService;
const aqmp = require('amqplib')

// may remove it in implementation

class MessageQueue {
    constructor(logger) {
        this.logger = logger
        this.connection = null
        this.channel = null
        this.reconnectDelay = 5000
        this.maxReconnectAttemps = 10;
        this.reconnectAttempts = 0;
    }

    async connect() {
        try {
            this.connection = await aqmp.connect(
                process.env.RABBITMQ_URL || 'amqp://localhost:5672',
                {
                    heartbeat: 60,
                    connectionTimeout: 10000,
                }
            )

            this.connection.on('error', (err) => {
                this.logger.error('RabbitMQ connection error:', err);
                this.handleReconnect();
            });

            this.connection.on('close', () => {
                this.logger.warn('RabbitMQ connection closed');
                this.handleReconnect();
            });

            this.channel = await this.connection.createChannel();
            await this.setupExchanges();

            await this.setUpQueues();

            this.reconnectAttemts = 0;
            this.logger.info('RabbitMQ connected')

        } catch (error) {
            this.logger.error('RabbitMq connection error', error);
            this.handleReconnect();
        }
    }

    async setupExchanges() {
        // stream events exchange
        await this.channel.assertExchange('stream.events', 'topic', { durable: true, autoDelete: false })

        //chat message exchange
        await this.channel.assertExchange('chat.message', 'fanout', { durable: true, autoDelete: false });

        //analytics message exchange
        await this.channel.assertExchange('analytics.event', 'direct', {
            durable: true,
            autoDelete: false
        })

        // user presence exchange
        await this.channel.assertExchange('user.presence', 'topic', {
            durable: false,
            autoDelete: false
        })
    }

    async setUpQueues() {
        //stream lifecycle queues
        await this.channel.assertQueue('stream.started', {
            durable: true,
            messageTtl: 86400000,
            maxLength: 1000
        })

        await this.channel.assertQueue('stream.ended', {
            durable: true,
            messageTtl: 86400000,
            maxLength: 1000
        })

        // analytics queues
        await this.channel.assertQueue('analytics.views', {
            durable: true,
            maxLength: 1000
        })

        await this.channel.assertQueue('analytics.engagement', {
            durable: true,
            messageTtl: 604800000,
            maxLength: 100000
        });

        // Background processing queues
        await this.channel.assertQueue('background.recording', {
            durable: true,
            messageTtl: 3600000, // 1 hour
            maxLength: 1000
        });

        await this.channel.assertQueue('background.notifications', {
            durable: true,
            messageTtl: 3600000,
            maxLength: 5000
        });

    }

    async handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttemps) {
            this.logger.error('Max reconnect attempts reached. Exiting...')
            return;
        }

        this.reconnectAttempts++;

        this.logger.info(`Attempting RabbitMQ reconnection ${this.reconnectAttempts}/${this.maxReconnectAttemps}`)
        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay * this.reconnectAttempts)
    }

    async publishStreamEvent(event, data) {
        if (!this.channel) {
            this.logger.error('RabbitMQ channel not initialized')
            return;
        }

        try {
            const routingKey = `stream.${event}`
            const message = {
                ...data,
                timestamp: new Date().toISOString(),
                eventType: event
            }

            await this.channel.publish('stream.events', routingKey, Buffer.from(JSON.stringify(message)), {
                persistant: true,
                messageId: `${event}-${data.streamId || data.id}-${Date.now()}`,
                timestamp: Date.now()
            })

            this.logger.debug(`Stream event published: ${event}`)

        } catch (error) {
            this.logger.error('Error publishing stream event', error)
        }
    }

    async publishChatMessage(message) {
        if (!this.channel) {
            this.logger.error('RabbitMQ channel not initialized')
            return;
        }

        try {
            const message = {
                ...data,
                publishedAt: new Date().toISOString()
            };

            await this.channel.publish(
                'chat.messages',
                '',
                Buffer.from(JSON.stringify(message)),
                {
                    messageId: `chat-${data.streamId}-${data.id}`,
                    timestamp: Date.now()
                }
            );

            this.logger.debug('Chat message published');
        } catch (error) {
            this.logger.error('Error publishing chat message:', error);
        }
    }

    async publishAnalyticsEvent(event, data) {
        if (!this.channel) {
            this.logger.error('Cannot publish: RabbitMQ channel not available');
            return;
        }

        try {
            const message = {
                ...data,
                timestamp: new Date().toISOString(),
                eventType: event
            };

            await this.channel.publish(
                'analytics.events',
                event,
                Buffer.from(JSON.stringify(message)),
                {
                    persistent: true,
                    messageId: `analytics-${event}-${Date.now()}`,
                    timestamp: Date.now()
                }
            );

            this.logger.debug(`Analytics event published: ${event}`);
        } catch (error) {
            this.logger.error('Error publishing analytics event:', error);
        }
    }

    async publishUserPresence(action, data) {
        if (!this.channel) {
            this.logger.error('Cannot publish: RabbitMQ channel not available');
            return;
        }

        try {
            const routingKey = `user.${action}`;
            const message = {
                ...data,
                timestamp: new Date().toISOString(),
                action
            };

            await this.channel.publish(
                'user.presence',
                routingKey,
                Buffer.from(JSON.stringify(message)),
                {
                    messageId: `presence-${action}-${data.userId}-${Date.now()}`,
                    timestamp: Date.now()
                }
            );

            this.logger.debug(`User presence published: ${action}`);
        } catch (error) {
            this.logger.error('Error publishing user presence:', error);
        }
    }

    async subscribeStreamEvents(callback) {
        if (!this.channel) {
            this.logger.error('Cannot subscribe: RabbitMQ channel not available');
            return;
        }

        try {
            const queue = await this.channel.assertQueue('', {
                exclusive: true,
                autoDelete: true
            });

            await this.channel.bindQueue(queue.queue, 'stream.events', 'stream.*');

            this.channel.consume(queue.queue, (msg) => {
                if (msg) {
                    try {
                        const data = JSON.parse(msg.content.toString());
                        const routingKey = msg.fields.routingKey;
                        callback(routingKey, data);
                        this.channel.ack(msg);
                    } catch (error) {
                        this.logger.error('Error processing stream event:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });

            this.logger.info('Subscribed to stream events');
        } catch (error) {
            this.logger.error('Error subscribing to stream events:', error);
        }
    }
    async subscribeChatMessages(callback) {
        if (!this.channel) {
            this.logger.error('Cannot subscribe: RabbitMQ channel not available');
            return;
        }

        try {
            const queue = await this.channel.assertQueue('', {
                exclusive: true,
                autoDelete: true
            });

            await this.channel.bindQueue(queue.queue, 'chat.messages', '');

            this.channel.consume(queue.queue, (msg) => {
                if (msg) {
                    try {
                        const data = JSON.parse(msg.content.toString());
                        callback(data);
                        this.channel.ack(msg);
                    } catch (error) {
                        this.logger.error('Error processing chat message:', error);
                        this.channel.nack(msg, false, false);
                    }
                }
            }, { noAck: false });

            this.logger.info('Subscribed to chat messages');
        } catch (error) {
            this.logger.error('Error subscribing to chat messages:', error);
        }
    }

    async close() {
        try {
            if (this.channel) {
                await this.channel.close();
            }
            if (this.connection) {
                await this.connection.close();
            }
            this.logger.info('RabbitMQ connection closed');
        } catch (error) {
            this.logger.error('Error closing RabbitMQ connection:', error);
        }
    }
}


module.exports = MessageQueue;
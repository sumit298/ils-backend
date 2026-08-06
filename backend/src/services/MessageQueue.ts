import amqp from 'amqplib';
import type { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import type { Logger } from 'winston';

interface VODConversionData {
  streamId: string;
  webmPath: string;
  userId: string;
}

class MessageQueue {
  private logger: Logger;
  public connection: ChannelModel | null;
  public channel: Channel | null;
  private reconnectDelay: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts: number;
  constructor(logger: Logger) {
    this.logger = logger;
    this.connection = null;
    this.channel = null;
    this.reconnectDelay = 5000;
    this.maxReconnectAttempts = 10;
    this.reconnectAttempts = 0;
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(
        process.env.RABBITMQ_URL || "amqp://localhost:5672",
      );

      if (!this.connection) {
        throw new Error("Failed to establish RabbitMQ connection");
      }

      this.connection.on("error", (err: Error) => {
        this.logger.error("RabbitMQ connection error:", err);
        this.handleReconnect();
      });

      this.connection.on("close", () => {
        this.logger.warn("RabbitMQ connection closed");
        this.handleReconnect();
      });

      this.channel = await this.connection.createChannel();
      await this.setupExchanges();

      await this.setupQueues();

      this.reconnectAttempts = 0;
      this.logger.info("RabbitMQ connected");
    } catch (error) {
      this.logger.error("RabbitMq connection error", error);
      this.handleReconnect();
    }
  }

  private async setupExchanges(): Promise<void> {
    if (!this.channel) return;
    // stream events exchange
    await this.channel!.assertExchange("stream.events", "topic", {
      durable: true,
      autoDelete: false,
    });

    //chat message exchange
    await this.channel!.assertExchange("chat.messages", "fanout", {
      durable: true,
      autoDelete: false,
    });

    //analytics message exchange
    await this.channel!.assertExchange("analytics.events", "direct", {
      durable: true,
      autoDelete: false,
    });

    // user presence exchange
    await this.channel.assertExchange("user.presence", "topic", {
      durable: false,
      autoDelete: false,
    });
  }

  private async setupQueues(): Promise<void> {
    if (!this.channel) return;
    //stream lifecycle queues
    await this.channel.assertQueue("stream.started", {
      durable: true,
      messageTtl: 86400000,
      maxLength: 1000,
    });

    await this.channel.assertQueue("stream.ended", {
      durable: true,
      messageTtl: 86400000,
      maxLength: 1000,
    });

    // analytics queues
    await this.channel.assertQueue("analytics.views", {
      durable: true,
      maxLength: 1000,
    });

    await this.channel.assertQueue("analytics.engagement", {
      durable: true,
      messageTtl: 604800000,
      maxLength: 100000,
    });

    // Background processing queues
    await this.channel.assertQueue("background.recording", {
      durable: true,
      messageTtl: 3600000, // 1 hour
      maxLength: 1000,
    });

    await this.channel.assertQueue("background.notifications", {
      durable: true,
      messageTtl: 3600000,
      maxLength: 5000,
    });

    await this.channel.assertExchange("vod.dlx", "direct", { durable: true });
    await this.channel.assertQueue("vod.conversion.dlq", { durable: true });
    await this.channel.bindQueue("vod.conversion.dlq", "vod.dlx", "vod.conversion");
    await this.channel.assertQueue("vod.conversion", {
      durable: true,
      maxLength: 1000,
      arguments: {
        "x-dead-letter-exchange": "vod.dlx",
        "x-dead-letter-routing-key": "vod.conversion",
      },
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error("Max reconnect attempts reached. Exiting...");
      return;
    }

    this.reconnectAttempts++;

    this.logger.info(
      `Attempting RabbitMQ reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
    );
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  async publishStreamEvent(
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.error("RabbitMQ channel not initialized");
      return;
    }

    try {
      const routingKey = `stream.${event}`;
      const message = {
        ...data,
        timestamp: new Date().toISOString(),
        eventType: event,
      };

      await this.channel.publish(
        "stream.events",
        routingKey,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          messageId: `${event}-${data.streamId || data.id}-${Date.now()}`,
          timestamp: Date.now(),
        },
      );

      this.logger.debug(`Stream event published: ${event}`);
    } catch (error) {
      this.logger.error("Error publishing stream event", error);
    }
  }

  async publishChatMessage(data: Record<string, unknown>): Promise<void> {
    if (!this.channel) {
      this.logger.error("RabbitMQ channel not initialized");
      return;
    }

    try {
      const message = {
        ...data,
        publishedAt: new Date().toISOString(),
      };

      await this.channel.publish(
        "chat.messages",
        "",
        Buffer.from(JSON.stringify(message)),
        {
          messageId: `chat-${data.streamId}-${data.id}`,
          timestamp: Date.now(),
        },
      );

      this.logger.debug("Chat message published");
    } catch (error) {
      this.logger.error("Error publishing chat message:", error);
    }
  }

  async publishAnalyticsEvent(
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.error("Cannot publish: RabbitMQ channel not available");
      return;
    }

    try {
      const message = {
        ...data,
        timestamp: new Date().toISOString(),
        eventType: event,
      };

      await this.channel.publish(
        "analytics.events",
        event,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          messageId: `analytics-${event}-${Date.now()}`,
          timestamp: Date.now(),
        },
      );

      this.logger.debug(`Analytics event published: ${event}`);
    } catch (error) {
      this.logger.error("Error publishing analytics event:", error);
    }
  }

  async publishUserPresence(
    action: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.error("Cannot publish: RabbitMQ channel not available");
      return;
    }

    try {
      const routingKey = `user.${action}`;
      const message = {
        ...data,
        timestamp: new Date().toISOString(),
        action,
      };

      await this.channel.publish(
        "user.presence",
        routingKey,
        Buffer.from(JSON.stringify(message)),
        {
          messageId: `presence-${action}-${data.userId}-${Date.now()}`,
          timestamp: Date.now(),
        },
      );

      this.logger.debug(`User presence published: ${action}`);
    } catch (error) {
      this.logger.error("Error publishing user presence:", error);
    }
  }

  async subscribeStreamEvents(
    callback: (routingKey: string, data: Record<string, unknown>) => void,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.error("Cannot subscribe: RabbitMQ channel not available");
      return;
    }

    try {
      const queue = await this.channel.assertQueue("", {
        exclusive: true,
        autoDelete: true,
      });

      await this.channel.bindQueue(queue.queue, "stream.events", "stream.*");

      this.channel.consume(queue.queue, (msg: ConsumeMessage | null) => {
        if (msg) {
          try {
            const data = JSON.parse(msg.content.toString());
            const routingKey = msg.fields.routingKey;
            callback(routingKey, data);
            this.channel!.ack(msg);
          } catch (error) {
            this.logger.error("Error processing stream event:", error);
            this.channel!.nack(msg, false, false);
          }
        }
      });

      this.logger.info("Subscribed to stream events");
    } catch (error) {
      this.logger.error("Error subscribing to stream events:", error);
    }
  }
  async subscribeChatMessages(
    callback: (data: unknown) => void,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.error("Cannot subscribe: RabbitMQ channel not available");
      return;
    }

    try {
      const queue = await this.channel.assertQueue("", {
        exclusive: true,
        autoDelete: true,
      });

      await this.channel.bindQueue(queue.queue, "chat.messages", "");

      this.channel.consume(
        queue.queue,
        (msg: ConsumeMessage | null) => {
          if (msg) {
            try {
              const data = JSON.parse(msg.content.toString());
              callback(data);
              this.channel!.ack(msg);
            } catch (error) {
              this.logger.error("Error processing chat message:", error);
              this.channel!.nack(msg, false, false);
            }
          }
        },
        { noAck: false },
      );

      this.logger.info("Subscribed to chat messages");
    } catch (error) {
      this.logger.error("Error subscribing to chat messages:", error);
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.info("RabbitMQ connection closed");
    } catch (error) {
      this.logger.error("Error closing RabbitMQ connection:", error);
    }
  }

  async publishVODConversion(data: VODConversionData): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn(`RabbitMQ not available, skipping queue`);
      return false;
    }

    try {
      await this.channel.sendToQueue(
        "vod.conversion",
        Buffer.from(JSON.stringify(data)),
        { persistent: true },
      );

      this.logger.info(`VOD conversion job queued for ${data.streamId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error queueing VOD conversion:`, error);
      return false;
    }
  }
}

export default MessageQueue;

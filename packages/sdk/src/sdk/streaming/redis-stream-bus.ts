import { createClient, type RedisClientType } from 'redis';
import type { StreamBus, StreamChunk } from './stream-bus';

export interface RedisStreamBusConfig {
  url: string;
  /** Optional prefix to isolate channels (default: 'ai-runtime:stream:'). */
  channelPrefix?: string;
}

/**
 * Redis Pub/Sub StreamBus implementation for distributed deployments.
 * Publish and subscribe are best-effort (ephemeral); the durable final result
 * still returns through Temporal as usual.
 */
export class RedisStreamBus implements StreamBus {
  private readonly pub: RedisClientType;
  private readonly sub: RedisClientType;
  private readonly prefix: string;
  private connectPromise: Promise<void> | null = null;

  constructor(cfg: RedisStreamBusConfig) {
    this.prefix = cfg.channelPrefix ?? 'ai-runtime:stream:';
    this.pub = createClient({ url: cfg.url });
    this.sub = createClient({ url: cfg.url });
  }

  private async ensureConnected(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = (async () => {
      if (!this.pub.isOpen) await this.pub.connect();
      if (!this.sub.isOpen) await this.sub.connect();
    })();
    this.connectPromise.catch(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  publish(channel: string, chunk: StreamChunk): void {
    void this.ensureConnected()
      .then(async () => {
        await this.pub.publish(this.prefix + channel, JSON.stringify(chunk));
      })
      .catch((err) => {
        console.error('[ai-runtime] RedisStreamBus publish failed:', err);
      });
  }

  async subscribe(channel: string, cb: (chunk: StreamChunk) => void): Promise<() => void> {
    let active = true;
    try {
      await this.ensureConnected();
      await this.sub.subscribe(this.prefix + channel, (message: string) => {
        if (!active) return;
        try {
          cb(JSON.parse(message) as StreamChunk);
        } catch {
          // ignore malformed messages
        }
      });
    } catch (err) {
      console.error('[ai-runtime] RedisStreamBus subscribe failed:', err);
      throw err;
    }
    return () => {
      active = false;
      void this.sub.unsubscribe(this.prefix + channel);
    };
  }

  async shutdown(): Promise<void> {
    await this.pub.quit();
    await this.sub.quit();
  }
}

import { RedisStreamBus } from '@ai-runtime/sdk';
import { config } from './config';

let bus: RedisStreamBus | null = null;

/** Shared bus for SSE token streaming; must match worker `RedisStreamBus` URL. */
export function getStreamBus(): RedisStreamBus {
  if (!bus) {
    bus = new RedisStreamBus({ url: config.REDIS_URL });
  }
  return bus;
}

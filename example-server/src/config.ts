import path from 'path';
import dotenv from 'dotenv';

// Load .env from process cwd (run from project root so .env at root is found)
dotenv.config({ path: path.join(process.cwd(), '.env') });

function parsePort(port: string | undefined, defaultPort: number): number {
  const parsed = parseInt(port ?? String(defaultPort), 10);
  if (Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return defaultPort;
  }
  return parsed;
}

/** Align with `@durion/sdk` `TEMPORAL_TLS` semantics. */
function parseTemporalTlsExplicit(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const s = raw.trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  return undefined;
}

export const config = {
  TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE ?? 'default',
  TASK_QUEUE: process.env.TASK_QUEUE ?? 'durion',
  TEMPORAL_API_KEY: process.env.TEMPORAL_API_KEY?.trim() || undefined,
  TEMPORAL_TLS: parseTemporalTlsExplicit(process.env.TEMPORAL_TLS),
  /** Same URL as the HITL worker’s RedisStreamBus for token SSE (`GET /runs/:id/token-stream` or `/v0/runs/:id/token-stream`). */
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  API_PORT: parsePort(process.env.API_PORT, 3000),
  /**
   * When set, Gateway v0 routes (`/v0/*`) require `Authorization: Bearer <token>` on fetch endpoints
   * and the same value as `access_token` query (or Bearer) on `GET .../token-stream`.
   * Unset = open access (typical local dev).
   */
  DURION_GATEWAY_TOKEN: process.env.DURION_GATEWAY_TOKEN?.trim() || undefined,
};

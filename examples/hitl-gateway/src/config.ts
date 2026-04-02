import path from 'path';
import dotenv from 'dotenv';

// Monorepo root `.env` (this file lives at examples/hitl-gateway/src/config.ts)
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });
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
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  /** Port for this gateway only (Durion Studio uses `API_PORT` / 3000 on studio-server). */
  HITL_GATEWAY_PORT: parsePort(process.env.HITL_GATEWAY_PORT, 3001),
  DURION_GATEWAY_TOKEN: process.env.DURION_GATEWAY_TOKEN?.trim() || undefined,
};

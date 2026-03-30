import path from 'path';
import dotenv from 'dotenv';

function parsePort(port: string | undefined, defaultPort: number): number {
  const parsed = parseInt(port ?? String(defaultPort), 10);
  return Number.isNaN(parsed) ? defaultPort : parsed;
}

/** `TEMPORAL_TLS` env: unset = infer from API key; false = plaintext; true = TLS. */
function parseTemporalTlsExplicit(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const s = raw.trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  return undefined;
}

// Load .env from repo root (monorepo: packages/sdk/dist/shared or src/shared -> ../../..)
const projectRoot = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

export const config = {
  TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE ?? 'default',
  TASK_QUEUE: process.env.TASK_QUEUE ?? 'durion',
  /** Temporal Cloud: set in env or pass `connection` / `nativeConnection` in code. Never log this. */
  TEMPORAL_API_KEY: process.env.TEMPORAL_API_KEY?.trim() || undefined,
  /**
   * Explicit TLS toggle. Unset: enable TLS when `TEMPORAL_API_KEY` is set (typical Cloud).
   * `false`: plaintext gRPC (local dev). `true`: TLS even without an API key.
   */
  TEMPORAL_TLS: parseTemporalTlsExplicit(process.env.TEMPORAL_TLS),
  API_PORT: parsePort(process.env.API_PORT, 3000),
};

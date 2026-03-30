import type { ConnectionOptions } from '@temporalio/client';
import type { NativeConnectionOptions } from '@temporalio/worker';
import { config } from '../../shared/config';

type EnvConnectionExtras = Pick<ConnectionOptions, 'apiKey' | 'tls'>;
type EnvWorkerExtras = Pick<NativeConnectionOptions, 'apiKey' | 'tls'>;

function envTlsFromConfig(): NativeConnectionOptions['tls'] | undefined {
  const tlsExplicit = config.TEMPORAL_TLS;
  if (tlsExplicit === false) return undefined;
  if (tlsExplicit === true || config.TEMPORAL_API_KEY) return true;
  return undefined;
}

function envDerivedConnectionExtras(): EnvConnectionExtras {
  const extras: EnvConnectionExtras = {};
  if (config.TEMPORAL_API_KEY) {
    extras.apiKey = config.TEMPORAL_API_KEY;
  }
  const tls = envTlsFromConfig();
  if (tls !== undefined) extras.tls = tls;
  return extras;
}

function envDerivedWorkerExtras(): EnvWorkerExtras {
  const extras: EnvWorkerExtras = {};
  if (config.TEMPORAL_API_KEY) {
    extras.apiKey = config.TEMPORAL_API_KEY;
  }
  const tls = envTlsFromConfig();
  if (tls !== undefined) extras.tls = tls;
  return extras;
}

/**
 * Merge env-based Temporal Cloud defaults with optional user options for `Connection.connect`.
 * Precedence: env (`TEMPORAL_API_KEY`, inferred `tls`), then `user` (wins on conflicts), then `address`.
 */
export function mergeClientConnectionOptions(
  address: string,
  user?: Omit<ConnectionOptions, 'address'>,
): ConnectionOptions {
  const fromEnv = envDerivedConnectionExtras();
  return {
    ...fromEnv,
    ...user,
    address,
  };
}

/**
 * Same env defaults for worker `NativeConnection.connect` (`apiKey` is string-only).
 */
export function mergeWorkerNativeConnectionOptions(
  address: string,
  user?: Omit<NativeConnectionOptions, 'address'>,
): NativeConnectionOptions {
  const fromEnv = envDerivedWorkerExtras();
  return {
    ...fromEnv,
    ...user,
    address,
  };
}

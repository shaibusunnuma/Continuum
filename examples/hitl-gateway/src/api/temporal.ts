import type { ConnectionOptions } from '@temporalio/client';
import { config } from '../config';
import { createClient, type SdkClient } from '@durion/sdk';

/** Same merge rules as the SDK env defaults; explicit so the gateway works even if SDK dotenv path differs. */
function gatewayTemporalConnectionExtras(): Omit<ConnectionOptions, 'address'> {
  const extras: Omit<ConnectionOptions, 'address'> = {};
  if (config.TEMPORAL_API_KEY) {
    extras.apiKey = config.TEMPORAL_API_KEY;
  }
  const tlsExplicit = config.TEMPORAL_TLS;
  if (tlsExplicit === false) {
    // plaintext
  } else if (tlsExplicit === true || config.TEMPORAL_API_KEY) {
    extras.tls = true;
  }
  return extras;
}

let clientInstance: SdkClient | null = null;
let clientInitPromise: Promise<SdkClient> | null = null;

export async function getTemporalClient(): Promise<SdkClient> {
  if (clientInstance) {
    return clientInstance;
  }
  if (clientInitPromise) {
    return clientInitPromise;
  }
  clientInitPromise = (async (): Promise<SdkClient> => {
    const connection = gatewayTemporalConnectionExtras();
    const client = await createClient({
      temporalAddress: config.TEMPORAL_ADDRESS,
      temporalNamespace: config.TEMPORAL_NAMESPACE,
      ...(Object.keys(connection).length > 0 ? { connection } : {}),
    });
    clientInstance = client;
    return client;
  })();
  try {
    return await clientInitPromise;
  } catch (err) {
    clientInitPromise = null;
    throw err;
  }
}

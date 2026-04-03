import type { ConnectionOptions } from '@temporalio/client';
import { createClient, type SdkClient } from '@durion/sdk';

let clientInstance: SdkClient | null = null;
let clientInitPromise: Promise<SdkClient> | null = null;

export async function getTemporalClient(opts: {
  address: string;
  namespace: string;
}): Promise<SdkClient> {
  if (clientInstance) return clientInstance;
  if (clientInitPromise) return clientInitPromise;

  clientInitPromise = (async (): Promise<SdkClient> => {
    const connection: Omit<ConnectionOptions, 'address'> = {};
    const apiKey = process.env.TEMPORAL_API_KEY?.trim();
    if (apiKey) {
      connection.apiKey = apiKey;
      connection.tls = true;
    }

    const client = await createClient({
      temporalAddress: opts.address,
      temporalNamespace: opts.namespace,
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

export async function closeTemporalClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.close();
    clientInstance = null;
    clientInitPromise = null;
  }
}

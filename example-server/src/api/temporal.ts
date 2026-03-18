import { createClient, type SdkClient } from '@ai-runtime/sdk';
import { config } from '../config';

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
    const client = await createClient({
      temporalAddress: config.TEMPORAL_ADDRESS,
      temporalNamespace: config.TEMPORAL_NAMESPACE,
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

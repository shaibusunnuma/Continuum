import { Client, Connection } from '@temporalio/client';
import { config } from '../config';

let clientInstance: Client | null = null;
let clientInitPromise: Promise<Client> | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (clientInstance) {
    return clientInstance;
  }
  if (clientInitPromise) {
    return clientInitPromise;
  }
  clientInitPromise = (async (): Promise<Client> => {
    const connection = await Connection.connect({
      address: config.TEMPORAL_ADDRESS,
    });
    const client = new Client({
      connection,
      namespace: config.TEMPORAL_NAMESPACE,
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

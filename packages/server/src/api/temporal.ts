import { Client, Connection } from '@temporalio/client';
import { config } from '../config';

let clientInstance: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (clientInstance) {
    return clientInstance;
  }
  const connection = await Connection.connect({
    address: config.TEMPORAL_ADDRESS,
  });
  clientInstance = new Client({
    connection,
    namespace: config.TEMPORAL_NAMESPACE,
  });
  return clientInstance;
}

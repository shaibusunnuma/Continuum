import { useWorkflowTokenStream } from '../useWorkflowTokenStream';
import { gatewayTokenStreamUrl } from './urls';

export interface UseGatewayTokenStreamOptions {
  /** API origin, no trailing slash. Use `''` for same-origin (e.g. Vite proxy). */
  baseURL: string;
  /** When set, appended as `access_token` query (SSE; browsers cannot set Authorization on EventSource). */
  accessToken?: string;
}

/** Token SSE for Gateway API v0 (`GET /v0/runs/:id/token-stream`). See `docs/gateway-api-v0.md` in the repo. Thin wrapper over {@link useWorkflowTokenStream}. */
export function useGatewayTokenStream(options: UseGatewayTokenStreamOptions) {
  const { baseURL, accessToken } = options;
  return useWorkflowTokenStream({
    getTokenStreamUrl: (runId) => gatewayTokenStreamUrl(baseURL, runId, { accessToken }),
  });
}

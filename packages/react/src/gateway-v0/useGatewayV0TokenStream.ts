import { useWorkflowTokenStream } from '../useWorkflowTokenStream';
import { gatewayV0TokenStreamUrl } from './urls';

export interface UseGatewayV0TokenStreamOptions {
  /** API origin, no trailing slash. Use `''` for same-origin (e.g. Vite proxy). */
  baseURL: string;
  /** When set, appended as `access_token` query (SSE; browsers cannot set Authorization on EventSource). */
  accessToken?: string;
}

/** Token SSE for Gateway API v0 (`GET /v0/runs/:id/token-stream`). Thin wrapper over {@link useWorkflowTokenStream}. */
export function useGatewayV0TokenStream(options: UseGatewayV0TokenStreamOptions) {
  const { baseURL, accessToken } = options;
  return useWorkflowTokenStream({
    getTokenStreamUrl: (runId) => gatewayV0TokenStreamUrl(baseURL, runId, { accessToken }),
  });
}

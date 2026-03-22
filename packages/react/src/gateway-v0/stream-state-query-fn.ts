import type { StreamState } from '@durion/sdk';
import { gatewayStreamStateUrl } from './urls';

async function resolveHeaders(
  h?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>),
): Promise<HeadersInit | undefined> {
  if (h == null) return undefined;
  return typeof h === 'function' ? await h() : h;
}

export interface GatewayStreamStateQueryFnOptions {
  accessToken?: string;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

/**
 * Default `queryFn` for {@link useGatewayStreamState}: `GET /v0/runs/:id/stream-state` (Gateway API v0).
 */
export function createGatewayStreamStateQueryFn(
  baseURL: string,
  options?: GatewayStreamStateQueryFnOptions,
): (workflowId: string, signal: AbortSignal) => Promise<StreamState> {
  return async (workflowId, signal) => {
    const url = gatewayStreamStateUrl(baseURL, workflowId);
    const extra = await resolveHeaders(options?.headers);
    const headers = new Headers(extra as HeadersInit | undefined);
    if (options?.accessToken != null && options.accessToken !== '') {
      headers.set('Authorization', `Bearer ${options.accessToken}`);
    }
    const res = await fetch(url, { signal, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Stream state failed (${res.status}): ${text || res.statusText}`);
    }
    return (await res.json()) as StreamState;
  };
}

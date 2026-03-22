import type { StreamState } from '@durion/sdk';
import { gatewayV0StreamStateUrl } from './urls';

async function resolveHeaders(
  h?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>),
): Promise<HeadersInit | undefined> {
  if (h == null) return undefined;
  return typeof h === 'function' ? await h() : h;
}

export interface GatewayV0StreamStateQueryFnOptions {
  accessToken?: string;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

/**
 * Default `queryFn` for {@link useGatewayV0StreamState}: `GET /v0/runs/:id/stream-state`.
 */
export function createGatewayV0StreamStateQueryFn(
  baseURL: string,
  options?: GatewayV0StreamStateQueryFnOptions,
): (workflowId: string, signal: AbortSignal) => Promise<StreamState> {
  return async (workflowId, signal) => {
    const url = gatewayV0StreamStateUrl(baseURL, workflowId);
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

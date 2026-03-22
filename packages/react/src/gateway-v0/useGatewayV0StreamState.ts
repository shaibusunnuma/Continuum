import { useMemo } from 'react';
import type { StreamState } from '@durion/sdk';
import { useWorkflowStreamState } from '../useWorkflowStreamState';
import { createGatewayV0StreamStateQueryFn } from './stream-state-query-fn';

export interface UseGatewayV0StreamStateOptions {
  workflowId?: string | null;
  /** API origin, no trailing slash. Use `''` for same-origin. */
  baseURL: string;
  pollIntervalMs?: number;
  enabled?: boolean;
  /** Sent as `Authorization: Bearer` on poll requests. */
  accessToken?: string;
  extraHeaders?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /**
   * Replace the default Gateway v0 poll entirely (escape hatch).
   * When set, `baseURL` / `accessToken` / `extraHeaders` are ignored for fetching.
   */
  queryFn?: (workflowId: string, signal: AbortSignal) => Promise<StreamState>;
}

/**
 * Polls `GET /v0/runs/:id/stream-state` (Gateway API v0). See `docs/gateway-api-v0.md` in the repo.
 */
export function useGatewayV0StreamState(options: UseGatewayV0StreamStateOptions) {
  const {
    baseURL,
    accessToken,
    extraHeaders,
    queryFn: userQueryFn,
    workflowId,
    pollIntervalMs,
    enabled,
  } = options;

  const queryFn = useMemo(() => {
    if (userQueryFn) return userQueryFn;
    return createGatewayV0StreamStateQueryFn(baseURL, {
      accessToken,
      headers: extraHeaders,
    });
  }, [userQueryFn, baseURL, accessToken, extraHeaders]);

  return useWorkflowStreamState({
    workflowId,
    pollIntervalMs,
    enabled,
    queryFn,
  });
}

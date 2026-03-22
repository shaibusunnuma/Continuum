import { useMemo } from 'react';
import type { StreamState } from '@durion/sdk';
import { useWorkflowStreamState } from '../useWorkflowStreamState';
import { createGatewayStreamStateQueryFn } from './stream-state-query-fn';

export interface UseGatewayStreamStateOptions {
  workflowId?: string | null;
  /** API origin, no trailing slash. Use `''` for same-origin. */
  baseURL: string;
  pollIntervalMs?: number;
  enabled?: boolean;
  /** Sent as `Authorization: Bearer` on poll requests. */
  accessToken?: string;
  extraHeaders?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /**
   * Replace the default Gateway poll entirely (escape hatch).
   * When set, `baseURL` / `accessToken` / `extraHeaders` are ignored for fetching.
   */
  queryFn?: (workflowId: string, signal: AbortSignal) => Promise<StreamState>;
}

/** Polls `GET /v0/runs/:id/stream-state` (Gateway API v0). See `docs/gateway-api-v0.md` in the repo. */
export function useGatewayStreamState(options: UseGatewayStreamStateOptions) {
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
    return createGatewayStreamStateQueryFn(baseURL, {
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

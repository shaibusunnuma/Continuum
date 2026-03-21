import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamState } from '@ai-runtime/sdk';

export interface UseWorkflowStreamStateOptions {
  /** Workflow execution id (Temporal workflow id). */
  workflowId?: string | null;
  /** Polling interval in ms. Default 1500. */
  pollIntervalMs?: number;
  /**
   * API base URL (no trailing slash required).
   * When set without `queryFn`, polls `GET {apiBaseUrl}/runs/{workflowId}/stream-state`
   * (matches example-server).
   */
  apiBaseUrl?: string;
  /** Custom fetcher for stream state (Temporal query behind your API). */
  queryFn?: (workflowId: string, signal: AbortSignal) => Promise<StreamState>;
  /** Optional headers for default fetch (e.g. Authorization). */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /** When false, no polling. Default true when workflowId is set. */
  enabled?: boolean;
}

function trimBase(url: string): string {
  return url.replace(/\/$/, '');
}

async function resolveHeaders(
  h?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>),
): Promise<HeadersInit | undefined> {
  if (h == null) return undefined;
  return typeof h === 'function' ? await h() : h;
}

/**
 * Polls workflow stream state (progressive UX: status, partial reply, messages).
 * Point `apiBaseUrl` at your backend that exposes `GET /runs/:workflowId/stream-state`
 * (see example-server), or pass `queryFn` for full control.
 */
export function useWorkflowStreamState(
  options: UseWorkflowStreamStateOptions,
): {
  state: StreamState | null;
  error: Error | null;
  loading: boolean;
} {
  const {
    workflowId,
    pollIntervalMs = 1500,
    apiBaseUrl,
    queryFn: userQueryFn,
    headers,
    enabled: enabledOpt,
  } = options;

  const enabled =
    enabledOpt !== false && workflowId != null && String(workflowId).length > 0;

  const [state, setState] = useState<StreamState | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const queryFn = useCallback(
    async (id: string, signal: AbortSignal): Promise<StreamState> => {
      if (userQueryFn) return userQueryFn(id, signal);
      if (apiBaseUrl) {
        const base = trimBase(apiBaseUrl);
        const hdrs = await resolveHeaders(headers);
        const res = await fetch(`${base}/runs/${encodeURIComponent(id)}/stream-state`, {
          signal,
          headers: hdrs,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Stream state failed (${res.status}): ${text || res.statusText}`);
        }
        return (await res.json()) as StreamState;
      }
      throw new Error(
        'useWorkflowStreamState: provide `queryFn` or `apiBaseUrl` (with example-server-compatible /runs/:id/stream-state).',
      );
    },
    [userQueryFn, apiBaseUrl, headers],
  );

  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  useEffect(() => {
    if (!enabled || !workflowId) {
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      try {
        setLoading(true);
        setError(null);
        const next = await queryFnRef.current(workflowId, ac.signal);
        if (!ac.signal.aborted) setState(next);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (!ac.signal.aborted) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    void tick();
    timer = setInterval(() => void tick(), pollIntervalMs);

    return () => {
      ac.abort();
      if (timer) clearInterval(timer);
    };
  }, [enabled, workflowId, pollIntervalMs]);

  return { state, error, loading };
}

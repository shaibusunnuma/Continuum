import { useEffect, useRef, useState } from 'react';
import type { StreamState } from '@ai-runtime/sdk';

export interface UseWorkflowStreamStateOptions {
  /** Workflow execution id (Temporal workflow id). */
  workflowId?: string | null;
  /** Polling interval in ms. Default 1500. */
  pollIntervalMs?: number;
  /**
   * Poll your backend for `StreamState` JSON (e.g. Temporal `streamState` query behind HTTP).
   * Not streaming — interval polling only. Implement with `fetch` to **your** route(s).
   */
  queryFn: (workflowId: string, signal: AbortSignal) => Promise<StreamState>;
  /** When false, no polling. Default true when workflowId is set. */
  enabled?: boolean;
}

/**
 * Polls JSON workflow UI state (status, partial reply, HITL flags, …) via **`queryFn`** — not SSE.
 *
 * `loading` is **only** true until the first successful fetch for the current `workflowId`
 * (background interval polls do not flip it — avoids UI flicker).
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
    queryFn: userQueryFn,
    enabled: enabledOpt,
  } = options;

  const enabled =
    enabledOpt !== false && workflowId != null && String(workflowId).length > 0;

  const [state, setState] = useState<StreamState | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const queryFnRef = useRef(userQueryFn);
  queryFnRef.current = userQueryFn;

  /** After first successful poll for this workflowId, background ticks keep loading false. */
  const hasDataRef = useRef(false);

  useEffect(() => {
    if (!workflowId) {
      hasDataRef.current = false;
      setState(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!enabled) {
      setLoading(false);
      setError(null);
      setState(null);
      return;
    }

    hasDataRef.current = false;
    setState(null);
    setError(null);

    const ac = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      try {
        if (!hasDataRef.current) {
          setLoading(true);
        }
        setError(null);
        const next = await queryFnRef.current(workflowId, ac.signal);
        if (!ac.signal.aborted) {
          setState(next);
          hasDataRef.current = true;
        }
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

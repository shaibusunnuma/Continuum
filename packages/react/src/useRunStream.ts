import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamState } from '@ai-runtime/sdk';
import {
  gatewayV0TokenStreamUrl,
  gatewayV0StreamStateUrl,
} from './gateway-v0/urls';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunStreamStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'waiting_for_input'
  | 'completed'
  | 'error';

export interface UseRunStreamOptions {
  /** API origin, no trailing slash. Use `''` for same-origin (e.g. Vite proxy). */
  baseURL: string;
  /**
   * Optional auth token.
   * - SSE: appended as `access_token` query param (EventSource cannot set headers).
   * - Poll: sent as `Authorization: Bearer`.
   */
  accessToken?: string;
  /** Polling interval for stream-state in ms. Default 1500. */
  pollIntervalMs?: number;
  /** Throttle SSE renders in ms. Default 0 (every frame). */
  throttleInMs?: number;
  /** Called for every text-delta token from SSE. */
  onToken?: (delta: string) => void;
  /** Called when the run status changes. */
  onStatusChange?: (status: RunStreamStatus) => void;
  /** When false, disables both SSE and polling. Default true when runId is set. */
  enabled?: boolean;
}

export interface UseRunStreamReturn {
  /** Accumulated LLM text (SSE deltas preferred, polled partialReply as fallback). */
  text: string;
  /** High-level run status. */
  status: RunStreamStatus;
  /** Full StreamState from polling (messages, currentStep, etc). */
  run: StreamState | null;
  /** Latest error, if any. */
  error: Error | null;
  /** True while SSE is open or connecting. */
  isStreaming: boolean;
  /** Manually close the SSE stream. */
  close: () => void;
  /** Reset all state (for reuse with a new run). */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Unified hook that combines SSE token streaming with polled stream-state.
 *
 * Internally opens an `EventSource` to `/v0/runs/:id/token-stream` for real-time
 * text deltas **and** polls `/v0/runs/:id/stream-state` for run metadata (status,
 * currentStep, messages, HITL flags). The `text` return merges both: SSE deltas are
 * preferred, with the polled `partialReply` used as a fallback for tokens that the
 * SSE connection missed.
 *
 * Inspired by [Trigger.dev `useRealtimeStream`](https://trigger.dev/docs/realtime/react-hooks/streams).
 */
export function useRunStream(
  runId: string | null | undefined,
  options: UseRunStreamOptions,
): UseRunStreamReturn {
  const {
    baseURL,
    accessToken,
    pollIntervalMs = 1500,
    throttleInMs = 0,
    onToken,
    onStatusChange,
    enabled: enabledOpt,
  } = options;

  const active =
    enabledOpt !== false && runId != null && String(runId).length > 0;

  // ---- State ---------------------------------------------------------------
  const [sseText, setSseText] = useState('');
  const [status, setStatusRaw] = useState<RunStreamStatus>('idle');
  const [run, setRun] = useState<StreamState | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Stable refs for callbacks (avoid re-subscribing on every render)
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  // Whether SSE has received at least one delta (used for fallback logic)
  const sseReceivedRef = useRef(false);

  // Throttle support
  const throttlePendingRef = useRef('');
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatus = useCallback((s: RunStreamStatus) => {
    setStatusRaw((prev) => {
      if (prev === s) return prev;
      onStatusChangeRef.current?.(s);
      return s;
    });
  }, []);

  // ---- SSE EventSource -----------------------------------------------------
  const esRef = useRef<EventSource | null>(null);
  const sseClosedCleanlyRef = useRef(false);

  const closeSSE = useCallback(() => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    // Flush any remaining throttled text
    if (throttlePendingRef.current) {
      const pending = throttlePendingRef.current;
      throttlePendingRef.current = '';
      setSseText((t) => t + pending);
    }
    esRef.current?.close();
    esRef.current = null;
  }, []);

  // ---- Public API ----------------------------------------------------------
  const close = useCallback(() => {
    closeSSE();
  }, [closeSSE]);

  const reset = useCallback(() => {
    closeSSE();
    sseClosedCleanlyRef.current = false;
    sseReceivedRef.current = false;
    throttlePendingRef.current = '';
    setSseText('');
    setRun(null);
    setError(null);
    setStatus('idle');
  }, [closeSSE, setStatus]);

  // ---- SSE lifecycle -------------------------------------------------------
  useEffect(() => {
    if (!active || !runId) return;

    sseClosedCleanlyRef.current = false;
    sseReceivedRef.current = false;
    throttlePendingRef.current = '';
    setSseText('');
    setError(null);
    setStatus('connecting');

    const url = gatewayV0TokenStreamUrl(baseURL, runId, { accessToken });
    const es = new EventSource(url);
    esRef.current = es;

    const flushThrottle = () => {
      if (throttlePendingRef.current) {
        const pending = throttlePendingRef.current;
        throttlePendingRef.current = '';
        setSseText((t) => t + pending);
      }
      throttleTimerRef.current = null;
    };

    es.addEventListener('open', () => {
      setStatus('streaming');
    });

    es.addEventListener('message', (ev: MessageEvent) => {
      try {
        const part = JSON.parse(ev.data) as {
          type: string;
          delta?: string;
          error?: string;
        };

        if (part.type === 'text-delta' && part.delta) {
          sseReceivedRef.current = true;
          onTokenRef.current?.(part.delta);

          if (throttleInMs > 0) {
            throttlePendingRef.current += part.delta;
            if (!throttleTimerRef.current) {
              throttleTimerRef.current = setTimeout(flushThrottle, throttleInMs);
            }
          } else {
            setSseText((t) => t + part.delta);
          }
        }

        if (part.type === 'finish') {
          sseClosedCleanlyRef.current = true;
          flushThrottle();
          setStatus('completed');
          closeSSE();
        }

        if (part.type === 'error') {
          setError(new Error(part.error ?? 'Stream error'));
          setStatus('error');
          closeSSE();
        }
      } catch {
        /* ignore malformed SSE */
      }
    });

    es.addEventListener('error', () => {
      if (sseClosedCleanlyRef.current) {
        closeSSE();
        return;
      }
      closeSSE();
      // Don't set error status if we never got streaming data — polling will handle it
      if (sseReceivedRef.current) {
        setStatus('error');
        setError((prev) => prev ?? new Error('EventSource error'));
      }
    });

    return () => {
      closeSSE();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, runId, baseURL, accessToken]);

  // ---- Poll stream-state ---------------------------------------------------
  useEffect(() => {
    if (!active || !runId) {
      setRun(null);
      return;
    }

    const ac = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      try {
        const url = gatewayV0StreamStateUrl(baseURL, runId);
        const headers = new Headers();
        if (accessToken) {
          headers.set('Authorization', `Bearer ${accessToken}`);
        }
        const res = await fetch(url, { signal: ac.signal, headers });
        if (!res.ok) return; // silent — SSE or next poll will recover
        const state = (await res.json()) as StreamState;
        if (ac.signal.aborted) return;

        setRun(state);

        // Sync status from polled state when SSE hasn't reported
        if (state.status === 'waiting_for_input') {
          setStatus('waiting_for_input');
        } else if (state.status === 'completed') {
          setStatus('completed');
        } else if (state.status === 'error') {
          setStatus('error');
        }

        // Stop polling once terminal
        if (state.status === 'completed' || state.status === 'error') {
          if (timer) clearInterval(timer);
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        // Non-fatal — SSE is primary; poll failures are silent
      }
    };

    void tick();
    timer = setInterval(() => void tick(), pollIntervalMs);

    return () => {
      ac.abort();
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, runId, baseURL, accessToken, pollIntervalMs]);

  // ---- Compute final text --------------------------------------------------
  // SSE text takes priority; fall back to polled partialReply when SSE hasn't received data
  const text =
    sseReceivedRef.current || sseText.length > 0
      ? sseText
      : run?.partialReply ?? '';

  const isStreaming = status === 'streaming' || status === 'connecting';

  return { text, status, run, error, isStreaming, close, reset };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamState } from '@durion/sdk';
import { gatewayTokenStreamUrl, gatewayStreamStateUrl } from './gateway-v0/urls';

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
  /** Temporal execution id; adds `?runId=` to stream-state and token-stream when set. */
  temporalRunId?: string;
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
  /** True while the token `EventSource` is connecting or open (not workflow completion). */
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
 * currentStep, messages, HITL flags). The `text` return merges both: accumulated SSE
 * text when non-empty, otherwise polled `partialReply` (workflow updates that field
 * after each model call; during streaming it may lag).
 *
 * **SSE `finish`** means the **model stream** ended for that round (Redis `finish`), not
 * that the Temporal workflow completed. Terminal hook `status` (`completed` / `error`)
 * comes from polled `stream-state` only.
 *
 * Same mental model as other run-scoped stream hooks: `runId`, optional `baseURL`, token for auth.
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
    temporalRunId,
  } = options;

  const active =
    enabledOpt !== false && runId != null && String(runId).length > 0;

  // ---- State ---------------------------------------------------------------
  const [sseText, setSseText] = useState('');
  /** Token SSE lifecycle — `isStreaming` follows this, not hook `status` (avoid treating SSE `finish` as workflow done). */
  const [ssePhase, setSsePhase] = useState<'off' | 'connecting' | 'open'>('off');
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
    setSsePhase('off');
    closeSSE();
  }, [closeSSE]);

  const reset = useCallback(() => {
    closeSSE();
    sseClosedCleanlyRef.current = false;
    sseReceivedRef.current = false;
    throttlePendingRef.current = '';
    setSsePhase('off');
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
    setSsePhase('connecting');
    setError(null);
    setStatus('connecting');

    const url = gatewayTokenStreamUrl(baseURL, runId, { accessToken, temporalRunId });
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
      setSsePhase('open');
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
          setSsePhase('off');
          closeSSE();
        }

        if (part.type === 'error') {
          setError(new Error(part.error ?? 'Stream error'));
          setStatus('error');
          setSsePhase('off');
          closeSSE();
        }
      } catch {
        /* ignore malformed SSE */
      }
    });

    es.addEventListener('error', () => {
      setSsePhase('off');
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
      setSsePhase('off');
      closeSSE();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, runId, baseURL, accessToken, temporalRunId]);

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
        const url = gatewayStreamStateUrl(baseURL, runId, { temporalRunId });
        const headers = new Headers();
        if (accessToken) {
          headers.set('Authorization', `Bearer ${accessToken}`);
        }
        const res = await fetch(url, { signal: ac.signal, headers });
        if (!res.ok) return; // silent — SSE or next poll will recover
        const state = (await res.json()) as StreamState;
        if (ac.signal.aborted) return;

        setRun(state);

        // Sync status from polled state when SSE hasn't reported.
        if (state.status === 'waiting_for_input') {
          setStatus('waiting_for_input');
        } else if (state.status === 'completed') {
          setStatus('completed');
        } else if (state.status === 'error') {
          setStatus('error');
        } else if (state.status === 'running') {
          // Workflow still executing (e.g. after token SSE `finish`, before next poll).
          setStatusRaw((prev) => {
            if (prev === 'waiting_for_input' || prev === 'completed' || prev === 'error') return prev;
            if (prev === 'streaming' || prev === 'connecting') return prev;
            const next: RunStreamStatus = 'streaming';
            onStatusChangeRef.current?.(next);
            return next;
          });
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
  }, [active, runId, baseURL, accessToken, temporalRunId, pollIntervalMs]);

  // ---- Compute final text --------------------------------------------------
  const text = sseText.length > 0 ? sseText : (run?.partialReply ?? '');

  // `isStreaming` is true while the SSE EventSource is alive AND the workflow
  // is still in a streaming phase. Once the poller reports a paused or terminal
  // state the model stream is logically done — we report false so UI controls
  // (e.g. HITL approve/reject) become enabled, even if the EventSource hasn't
  // received the `finish` frame yet.
  const isStreaming =
    ssePhase !== 'off' &&
    status !== 'waiting_for_input' &&
    status !== 'completed' &&
    status !== 'error';

  return { text, status, run, error, isStreaming, close, reset };
}

import { useCallback, useEffect, useRef, useState } from 'react';

export type WorkflowTokenStreamStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'done'
  | 'error';

export interface UseWorkflowTokenStreamOptions {
  /**
   * Resolves the **full URL** of the token SSE endpoint for a workflow run (your server’s contract).
   * You own host, path, and auth — pass the final string the browser’s `EventSource` should open.
   */
  getTokenStreamUrl: (workflowId: string) => string;
}

/**
 * Subscribes to LLM token deltas over SSE at **`getTokenStreamUrl(workflowId)`** (your server).
 * Expects Vercel AI UI–style `text-delta` / `finish` messages; accumulates deltas into `text`.
 *
 * **Subscribe-before-start:** use {@link subscribeThenStart} so the EventSource is open *before* you
 * start the workflow (or next model round), so early chunks aren’t missed — same “connect, then run”
 * ordering you’d use with any ephemeral SSE channel.
 */
export function useWorkflowTokenStream(options: UseWorkflowTokenStreamOptions) {
  const { getTokenStreamUrl } = options;

  const [text, setText] = useState('');
  const [status, setStatus] = useState<WorkflowTokenStreamStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const closedCleanlyRef = useRef(false);

  const close = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const reset = useCallback(() => {
    close();
    closedCleanlyRef.current = false;
    setText('');
    setStatus('idle');
    setError(null);
  }, [close]);

  useEffect(() => () => close(), [close]);

  const getTokenStreamUrlRef = useRef(getTokenStreamUrl);
  getTokenStreamUrlRef.current = getTokenStreamUrl;

  const subscribeThenStart = useCallback(
    (workflowId: string, afterConnected: () => void | Promise<void>) => {
      close();
      closedCleanlyRef.current = false;
      setText('');
      setError(null);
      setStatus('connecting');

      const url = getTokenStreamUrlRef.current(workflowId);
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('open', () => {
        void (async () => {
          try {
            await afterConnected();
            setStatus('streaming');
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            setError(err);
            setStatus('error');
            close();
          }
        })();
      });

      es.addEventListener('message', (ev: MessageEvent) => {
        try {
          const part = JSON.parse(ev.data) as { type: string; delta?: string; error?: string };
          if (part.type === 'text-delta' && part.delta) {
            setText((t) => t + part.delta);
          }
          if (part.type === 'finish') {
            closedCleanlyRef.current = true;
            setStatus('done');
            close();
          }
          if (part.type === 'error') {
            setError(new Error(part.error ?? 'Stream error'));
            setStatus('error');
            close();
          }
        } catch {
          /* ignore malformed SSE */
        }
      });

      es.addEventListener('error', () => {
        if (closedCleanlyRef.current) {
          close();
          return;
        }
        close();
        setStatus('error');
        setError((prev) => prev ?? new Error('EventSource error'));
      });
    },
    [close],
  );

  const isStreaming = status === 'streaming' || status === 'connecting';

  return {
    /** Accumulated text from `text-delta` parts. */
    text,
    status,
    error,
    /** True while waiting for open or actively receiving deltas (until `done` / `error`). */
    isStreaming,
    /**
     * Open SSE for `workflowId`, then run `afterConnected` (e.g. start workflow).
     * Call again for each new model round (e.g. after HITL reject).
     */
    subscribeThenStart,
    reset,
    close,
  };
}

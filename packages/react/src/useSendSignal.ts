import { useCallback, useRef, useState } from 'react';
import { gatewayV0SignalUrl } from './gateway-v0/urls';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSendSignalOptions {
  /** API origin, no trailing slash. Use `''` for same-origin. */
  baseURL: string;
  /** Sent as `Authorization: Bearer` on signal requests. */
  accessToken?: string;
}

export interface UseSendSignalReturn {
  /** Send a signal to a running workflow. Default signal name is `durion:user-input`. */
  send: (
    runId: string,
    data: unknown,
    signalName?: string,
  ) => Promise<void>;
  /** True while the signal POST is in flight. */
  isSending: boolean;
  /** Last error from a failed send, if any. */
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Simple hook for sending signals (e.g. HITL input) to a running workflow.
 *
 * Wraps `POST /v0/runs/:id/signal` with loading/error state.
 *
 * ```tsx
 * const { send, isSending, error } = useSendSignal({ baseURL: '' });
 * await send(runId, { approved: true });
 * ```
 */
export function useSendSignal(options: UseSendSignalOptions): UseSendSignalReturn {
  const { baseURL, accessToken } = options;

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Stable refs to avoid stale closures
  const baseURLRef = useRef(baseURL);
  baseURLRef.current = baseURL;
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const send = useCallback(
    async (
      runId: string,
      data: unknown,
      signalName = 'durion:user-input',
    ): Promise<void> => {
      setIsSending(true);
      setError(null);
      try {
        const url = gatewayV0SignalUrl(baseURLRef.current, runId);
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (accessTokenRef.current) {
          headers['Authorization'] = `Bearer ${accessTokenRef.current}`;
        }
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: signalName, data }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Signal failed (${res.status}): ${body || res.statusText}`);
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [],
  );

  return { send, isSending, error };
}

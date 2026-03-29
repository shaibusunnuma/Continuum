import type { GraphStreamState, StudioRunRow, StreamState } from './types';

const GATEWAY_TOKEN_KEY = 'durion.gatewayToken';

export function getGatewayToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    import.meta.env.VITE_GATEWAY_TOKEN?.trim() ||
    window.localStorage.getItem(GATEWAY_TOKEN_KEY)?.trim() ||
    undefined
  );
}

export function setGatewayToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(GATEWAY_TOKEN_KEY, token);
  else window.localStorage.removeItem(GATEWAY_TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const t = getGatewayToken();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

const DEFAULT_FETCH_MS = 30_000;

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      message = j.message ?? j.error ?? text;
    } catch {
      /* ignore */
    }
    throw new Error(message || `HTTP ${res.status}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_MS, signal, ...rest } = init;
  const controller = new AbortController();
  const t = window.setTimeout(() => controller.abort(), timeoutMs);
  const merged =
    signal != null
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
  return fetch(input, { ...rest, signal: merged }).finally(() => {
    window.clearTimeout(t);
  });
}

export async function listRuns(params: {
  limit?: number;
  nextPageToken?: string;
  query?: string;
}): Promise<{ runs: StudioRunRow[]; nextPageToken?: string }> {
  const sp = new URLSearchParams();
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.nextPageToken) sp.set('nextPageToken', params.nextPageToken);
  if (params.query) sp.set('query', params.query);
  const q = sp.toString();
  const res = await fetchWithTimeout(`/v0/studio/runs${q ? `?${q}` : ''}`, {
    headers: { ...authHeaders() },
  });
  return parseJson(res);
}

export async function getStreamState(workflowId: string): Promise<StreamState | GraphStreamState> {
  const res = await fetchWithTimeout(`/v0/runs/${encodeURIComponent(workflowId)}/stream-state`, {
    headers: { ...authHeaders() },
  });
  return parseJson(res);
}

export async function getHistory(workflowId: string): Promise<unknown> {
  const res = await fetchWithTimeout(`/v0/studio/runs/${encodeURIComponent(workflowId)}/history`, {
    headers: { ...authHeaders() },
    timeoutMs: 120_000,
  });
  return parseJson(res);
}

export async function describeRun(workflowId: string): Promise<{
  workflowId: string;
  runId: string | null;
  status: string;
  type: unknown;
  taskQueue: string | null;
  startTime: string | null;
  closeTime: string | null;
  memo: Record<string, unknown>;
}> {
  const res = await fetchWithTimeout(`/v0/runs/${encodeURIComponent(workflowId)}`, {
    headers: { ...authHeaders() },
  });
  return parseJson(res);
}

export async function getResult(workflowId: string): Promise<{
  workflowId: string;
  status: string;
  result: unknown;
  error?: string;
}> {
  const res = await fetchWithTimeout(`/v0/runs/${encodeURIComponent(workflowId)}/result`, {
    headers: { ...authHeaders() },
  });
  return parseJson(res);
}

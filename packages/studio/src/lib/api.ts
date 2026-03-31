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

/** Workflow queries need a worker; cap wait so the run detail page still loads from describe/history. */
export const STREAM_STATE_FETCH_MS = 3_500;

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

/** Optional execution pin for gateway `GET /v0/runs/...` when multiple runs share a workflow id. */
export type RunScopedQuery = { runId?: string };

function runQueryString(opts?: RunScopedQuery): string {
  const r = opts?.runId?.trim();
  return r ? `?runId=${encodeURIComponent(r)}` : '';
}

/** Studio router path for a run; include `runId` when linking to a specific execution. */
export function runDetailHref(workflowId: string, opts?: RunScopedQuery): string {
  return `/runs/${encodeURIComponent(workflowId)}${runQueryString(opts)}`;
}

export interface ListRunsParams {
  limit?: number;
  nextPageToken?: string;
  /** Raw Temporal visibility query (AND-combined with structured filters on the server). */
  query?: string;
  executionStatus?: string;
  workflowType?: string;
  workflowId?: string;
  /** ISO-8601 datetime; server maps to `StartTime >=` / `<=`. */
  startAfter?: string;
  startBefore?: string;
  /**
   * Temporal visibility `ParentWorkflowId` filter (server-dependent).
   * `roots` → `ParentWorkflowId IS NULL`; `children` → `IS NOT NULL`.
   */
  composition?: 'all' | 'roots' | 'children';
  /** Restrict to children of this parent workflow id. */
  parentWorkflowId?: string;
}

export async function listRuns(params: ListRunsParams): Promise<{
  runs: StudioRunRow[];
  nextPageToken?: string;
}> {
  const sp = new URLSearchParams();
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.nextPageToken) sp.set('nextPageToken', params.nextPageToken);
  if (params.query) sp.set('query', params.query);
  if (params.executionStatus) sp.set('executionStatus', params.executionStatus);
  if (params.workflowType) sp.set('workflowType', params.workflowType);
  if (params.workflowId) sp.set('workflowId', params.workflowId);
  if (params.startAfter) sp.set('startAfter', params.startAfter);
  if (params.startBefore) sp.set('startBefore', params.startBefore);
  if (params.composition && params.composition !== 'all') sp.set('composition', params.composition);
  if (params.parentWorkflowId?.trim()) sp.set('parentWorkflowId', params.parentWorkflowId.trim());
  const q = sp.toString();
  const res = await fetchWithTimeout(`/v0/studio/runs${q ? `?${q}` : ''}`, {
    headers: { ...authHeaders() },
  });
  return parseJson(res);
}

export async function getStreamState(
  workflowId: string,
  opts?: RunScopedQuery,
): Promise<StreamState | GraphStreamState> {
  const res = await fetchWithTimeout(
    `/v0/runs/${encodeURIComponent(workflowId)}/stream-state${runQueryString(opts)}`,
    {
      headers: { ...authHeaders() },
      timeoutMs: STREAM_STATE_FETCH_MS,
    },
  );
  return parseJson(res);
}

export async function getHistory(workflowId: string, opts?: RunScopedQuery): Promise<unknown> {
  const res = await fetchWithTimeout(
    `/v0/studio/runs/${encodeURIComponent(workflowId)}/history${runQueryString(opts)}`,
    {
      headers: { ...authHeaders() },
      timeoutMs: 120_000,
    },
  );
  return parseJson(res);
}

export async function describeRun(
  workflowId: string,
  opts?: RunScopedQuery,
): Promise<{
  workflowId: string;
  runId: string | null;
  status: string;
  type: unknown;
  taskQueue: string | null;
  startTime: string | null;
  closeTime: string | null;
  memo: Record<string, unknown>;
  parentWorkflowId: string | null;
  parentRunId: string | null;
  rootWorkflowId: string | null;
  rootRunId: string | null;
}> {
  const res = await fetchWithTimeout(
    `/v0/runs/${encodeURIComponent(workflowId)}${runQueryString(opts)}`,
    {
      headers: { ...authHeaders() },
    },
  );
  return parseJson(res);
}

export async function getResult(
  workflowId: string,
  opts?: RunScopedQuery,
): Promise<{
  workflowId: string;
  status: string;
  result: unknown;
  error?: string;
}> {
  const res = await fetchWithTimeout(
    `/v0/runs/${encodeURIComponent(workflowId)}/result${runQueryString(opts)}`,
    {
      headers: { ...authHeaders() },
    },
  );
  return parseJson(res);
}

export async function getSpans(workflowId: string): Promise<any[]> {
  const res = await fetchWithTimeout(`/v0/studio/runs/${encodeURIComponent(workflowId)}/spans`, {
    headers: { ...authHeaders() },
    timeoutMs: 30_000,
  });
  return parseJson(res);
}

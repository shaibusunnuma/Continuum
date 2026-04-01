/** URL builders for Gateway API v0 (`/v0/...`). Names omit “v0”; the path encodes the version. */
/** Join `baseURL` (no trailing slash) with an absolute path. */
export function trimGatewayBase(url: string): string {
  return url.replace(/\/$/, '');
}

function joinBasePath(baseURL: string, path: string): string {
  const base = trimGatewayBase(baseURL);
  return base.length > 0 ? `${base}${path}` : path;
}

const RUNS = '/v0/runs';
const WORKFLOWS = '/v0/workflows';

export function gatewayStreamStateUrl(
  baseURL: string,
  workflowId: string,
  options?: { temporalRunId?: string },
): string {
  let u = joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(workflowId)}/stream-state`);
  const tr = options?.temporalRunId?.trim();
  if (tr) {
    const sep = u.includes('?') ? '&' : '?';
    u = `${u}${sep}runId=${encodeURIComponent(tr)}`;
  }
  return u;
}

export function gatewayTokenStreamUrl(
  baseURL: string,
  workflowId: string,
  options?: { accessToken?: string; temporalRunId?: string },
): string {
  let u = joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(workflowId)}/token-stream`);
  const params = new URLSearchParams();
  const tr = options?.temporalRunId?.trim();
  if (tr) params.set('runId', tr);
  const token = options?.accessToken;
  if (token != null && token !== '') params.set('access_token', token);
  const q = params.toString();
  if (q) {
    const sep = u.includes('?') ? '&' : '?';
    u = `${u}${sep}${q}`;
  }
  return u;
}

export function gatewaySignalUrl(baseURL: string, runId: string): string {
  return joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(runId)}/signal`);
}

export function gatewayResultUrl(baseURL: string, runId: string): string {
  return joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(runId)}/result`);
}

export function gatewayRunDescribeUrl(baseURL: string, runId: string): string {
  return joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(runId)}`);
}

export function gatewayWorkflowsStartUrl(baseURL: string): string {
  return joinBasePath(baseURL, `${WORKFLOWS}/start`);
}

export function gatewayAgentsStartUrl(baseURL: string): string {
  return joinBasePath(baseURL, '/v0/agents/start');
}

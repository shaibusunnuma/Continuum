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

export function gatewayStreamStateUrl(baseURL: string, runId: string): string {
  return joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(runId)}/stream-state`);
}

export function gatewayTokenStreamUrl(
  baseURL: string,
  runId: string,
  options?: { accessToken?: string },
): string {
  const u = joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(runId)}/token-stream`);
  const token = options?.accessToken;
  if (token == null || token === '') return u;
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}access_token=${encodeURIComponent(token)}`;
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

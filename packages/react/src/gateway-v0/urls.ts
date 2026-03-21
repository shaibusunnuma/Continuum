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

export function gatewayV0StreamStateUrl(baseURL: string, runId: string): string {
  return joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(runId)}/stream-state`);
}

export function gatewayV0TokenStreamUrl(
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

export function gatewayV0SignalUrl(baseURL: string, runId: string): string {
  return joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(runId)}/signal`);
}

export function gatewayV0ResultUrl(baseURL: string, runId: string): string {
  return joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(runId)}/result`);
}

export function gatewayV0RunDescribeUrl(baseURL: string, runId: string): string {
  return joinBasePath(baseURL, `${RUNS}/${encodeURIComponent(runId)}`);
}

export function gatewayV0WorkflowsStartUrl(baseURL: string): string {
  return joinBasePath(baseURL, `${WORKFLOWS}/start`);
}

export function gatewayV0AgentsStartUrl(baseURL: string): string {
  return joinBasePath(baseURL, '/v0/agents/start');
}

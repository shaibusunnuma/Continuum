/**
 * Demo-only `fetch` helpers for Gateway API v0 (`/v0/...`). URLs come from `@durion/react`.
 */
import {
  gatewayResultUrl,
  gatewaySignalUrl,
  gatewayWorkflowsStartUrl,
} from '@durion/react';

/** Temporal signal name for `ctx.waitForInput` (SDK workflow adapter). */
export const DURION_USER_INPUT_SIGNAL = 'durion:user-input';

export interface StartWorkflowBody {
  workflowType: string;
  input: Record<string, unknown>;
  workflowId: string;
  taskQueue?: string;
}

function authHeaders(): HeadersInit | undefined {
  const t = import.meta.env.VITE_DURION_GATEWAY_TOKEN as string | undefined;
  if (t == null || t === '') return undefined;
  return { Authorization: `Bearer ${t}` };
}

export async function startWorkflow(
  apiBaseUrl: string,
  body: StartWorkflowBody,
): Promise<{ workflowId: string }> {
  const res = await fetch(gatewayWorkflowsStartUrl(apiBaseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || `Start failed (${res.status})`);
  }
  return (await res.json()) as { workflowId: string };
}

export async function sendWorkflowSignal(
  apiBaseUrl: string,
  workflowId: string,
  name: string,
  data?: unknown,
): Promise<void> {
  const res = await fetch(gatewaySignalUrl(apiBaseUrl, workflowId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data !== undefined ? { name, data } : { name }),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || `Signal failed (${res.status})`);
  }
}

export async function fetchWorkflowResult<T = unknown>(
  apiBaseUrl: string,
  workflowId: string,
): Promise<{ status: string; result: T | null }> {
  const res = await fetch(gatewayResultUrl(apiBaseUrl, workflowId), {
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || `Result failed (${res.status})`);
  }
  return (await res.json()) as { status: string; result: T | null };
}

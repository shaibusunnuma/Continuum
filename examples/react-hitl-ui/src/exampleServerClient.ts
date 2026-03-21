/**
 * Demo-only `fetch` helpers for Gateway API v0 (`/v0/...`). URLs come from `@ai-runtime/react`.
 */
import {
  gatewayV0ResultUrl,
  gatewayV0SignalUrl,
  gatewayV0WorkflowsStartUrl,
} from '@ai-runtime/react';

/** Temporal signal name for `ctx.waitForInput` (SDK workflow adapter). */
export const AI_RUNTIME_USER_INPUT_SIGNAL = 'ai-runtime:user-input';

export interface StartWorkflowBody {
  workflowType: string;
  input: Record<string, unknown>;
  workflowId: string;
  taskQueue?: string;
}

function authHeaders(): HeadersInit | undefined {
  const t = import.meta.env.VITE_AI_RUNTIME_GATEWAY_TOKEN as string | undefined;
  if (t == null || t === '') return undefined;
  return { Authorization: `Bearer ${t}` };
}

export async function startWorkflow(
  apiBaseUrl: string,
  body: StartWorkflowBody,
): Promise<{ workflowId: string }> {
  const res = await fetch(gatewayV0WorkflowsStartUrl(apiBaseUrl), {
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
  const res = await fetch(gatewayV0SignalUrl(apiBaseUrl, workflowId), {
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
  const res = await fetch(gatewayV0ResultUrl(apiBaseUrl, workflowId), {
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || `Result failed (${res.status})`);
  }
  return (await res.json()) as { status: string; result: T | null };
}

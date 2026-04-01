export interface OTLPSpan {
  traceId: string;
  spanId: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<{
    key: string;
    value: any;
  }>;
  status: {
    code?: number;
    message?: string;
  };
  events: any[];
  links: any[];
}

const MAX_SPANS = 2000;
let spanBuffer: OTLPSpan[] = [];

/**
 * Parses raw OTLP http/json trace payload and adds to ring buffer
 */
export function ingestSpans(payload: any) {
  if (!payload || !Array.isArray(payload.resourceSpans)) return;

  const newSpans: OTLPSpan[] = [];

  for (const resourceSpan of payload.resourceSpans) {
    if (!Array.isArray(resourceSpan.scopeSpans)) continue;
    for (const scopeSpan of resourceSpan.scopeSpans) {
      if (!Array.isArray(scopeSpan.spans)) continue;
      for (const span of scopeSpan.spans) {
        newSpans.push(span);
      }
    }
  }

  spanBuffer = [...spanBuffer, ...newSpans].slice(-MAX_SPANS);
}

/**
 * Returns spans whose attributes include `durion.workflowId` equal to `workflowId`
 * (the Temporal workflow id from Studio / gateway).
 *
 * When `temporalRunId` is set, only spans whose attributes include `durion.runId`
 * matching that execution are returned (same workflow id, different runs).
 */
export function querySpans(workflowId: string, temporalRunId?: string): OTLPSpan[] {
  const runTrim = temporalRunId?.trim();
  return spanBuffer.filter((span) => {
    const attrs = span.attributes || [];
    const wfOk = attrs.some(
      (attr) =>
        attr.key === 'durion.workflowId' && attr.value?.stringValue === workflowId,
    );
    if (!wfOk) return false;
    if (!runTrim) return true;
    return attrs.some(
      (attr) =>
        attr.key === 'durion.runId' && attr.value?.stringValue === runTrim,
    );
  });
}

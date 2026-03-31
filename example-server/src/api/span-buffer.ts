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
 * (the Temporal workflow id passed from Studio / gateway).
 *
 * Spans may also carry `durion.runId` (Temporal run id); that is a different id from
 * workflow id. A future run-scoped API could filter on `durion.runId` explicitly.
 */
export function querySpans(workflowId: string): OTLPSpan[] {
  return spanBuffer.filter((span) => {
    const attrs = span.attributes || [];
    return attrs.some(
      (attr) =>
        attr.key === 'durion.workflowId' && attr.value?.stringValue === workflowId,
    );
  });
}

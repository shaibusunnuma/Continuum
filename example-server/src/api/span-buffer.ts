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
 * Scans the buffer and finds spans related to a specific workflowId/traceId.
 * We look at span attributes for 'durion.runId' or 'durion.workflowId'.
 */
export function querySpans(workflowId: string): OTLPSpan[] {
  return spanBuffer.filter((span) => {
    // Check attributes for workflowId correlation
    const attrs = span.attributes || [];
    return attrs.some((attr) => {
      if (attr.key === 'durion.workflowId' || attr.key === 'durion.runId') {
        return attr.value?.stringValue === workflowId;
      }
      return false;
    });
  });
}

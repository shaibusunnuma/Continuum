import { describe, it, expect, beforeEach } from 'vitest';
import { ingestSpans, querySpans, clearSpans } from '../../src/gateway/span-buffer';

function makeSpan(workflowId: string, runId?: string) {
  const attrs = [
    { key: 'durion.workflowId', value: { stringValue: workflowId } },
  ];
  if (runId) {
    attrs.push({ key: 'durion.runId', value: { stringValue: runId } });
  }
  return {
    traceId: 'trace-1',
    spanId: 'span-1',
    name: 'test-span',
    kind: 1,
    startTimeUnixNano: '1000',
    endTimeUnixNano: '2000',
    attributes: attrs,
    status: {},
    events: [],
    links: [],
  };
}

function makePayload(spans: ReturnType<typeof makeSpan>[]) {
  return {
    resourceSpans: [{
      scopeSpans: [{
        spans,
      }],
    }],
  };
}

describe('span-buffer', () => {
  beforeEach(() => {
    clearSpans();
  });

  it('ingests and queries spans by workflowId', () => {
    ingestSpans(makePayload([makeSpan('wf-1'), makeSpan('wf-2')]));
    expect(querySpans('wf-1')).toHaveLength(1);
    expect(querySpans('wf-2')).toHaveLength(1);
    expect(querySpans('wf-3')).toHaveLength(0);
  });

  it('filters by runId when provided', () => {
    ingestSpans(makePayload([
      makeSpan('wf-1', 'run-a'),
      makeSpan('wf-1', 'run-b'),
      makeSpan('wf-1'),
    ]));
    expect(querySpans('wf-1')).toHaveLength(3);
    expect(querySpans('wf-1', 'run-a')).toHaveLength(1);
    expect(querySpans('wf-1', 'run-b')).toHaveLength(1);
  });

  it('ignores invalid payloads', () => {
    ingestSpans(null);
    ingestSpans({});
    ingestSpans({ resourceSpans: 'not-array' });
    expect(querySpans('anything')).toHaveLength(0);
  });

  it('clearSpans resets the buffer', () => {
    ingestSpans(makePayload([makeSpan('wf-1')]));
    expect(querySpans('wf-1')).toHaveLength(1);
    clearSpans();
    expect(querySpans('wf-1')).toHaveLength(0);
  });
});

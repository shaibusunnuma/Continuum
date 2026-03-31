import { describe, expect, it } from 'vitest';
import { parseActivityStepsFromHistory, parseFullHistory } from './parse-history';

describe('parseActivityStepsFromHistory', () => {
  it('returns activity names from scheduled events', () => {
    const history = {
      events: [
        {
          eventId: '3',
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_SCHEDULED',
          activityTaskScheduledEventAttributes: {
            activityType: { name: 'runModel' },
          },
        },
        {
          eventId: '5',
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_SCHEDULED',
          activityTaskScheduledEventAttributes: {
            activityType: { name: 'runTool' },
          },
        },
      ],
    };
    const steps = parseActivityStepsFromHistory(history);
    expect(steps).toEqual([
      { eventId: '3', activityName: 'runModel' },
      { eventId: '5', activityName: 'runTool' },
    ]);
  });

  it('returns empty for invalid input', () => {
    expect(parseActivityStepsFromHistory(null)).toEqual([]);
    expect(parseActivityStepsFromHistory({})).toEqual([]);
  });
});

describe('parseFullHistory', () => {
  it('extracts workflow type, input, result, and events', () => {
    const history = {
      events: [
        {
          eventId: '1',
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED',
          eventTime: '2026-03-29T13:16:51Z',
          workflowExecutionStartedEventAttributes: {
            workflowType: { name: 'agentResearch' },
            taskQueue: { name: 'durion-graph-pipeline' },
            input: { payloads: [{ topic: 'renewable energy' }] },
            memo: {},
          },
        },
        {
          eventId: '5',
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_SCHEDULED',
          eventTime: '2026-03-29T13:16:52Z',
          activityTaskScheduledEventAttributes: {
            activityType: { name: 'runModel' },
          },
        },
        {
          eventId: '6',
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_STARTED',
          eventTime: '2026-03-29T13:16:53Z',
          activityTaskStartedEventAttributes: { scheduledEventId: '5' },
        },
        {
          eventId: '7',
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_COMPLETED',
          eventTime: '2026-03-29T13:17:10Z',
          activityTaskCompletedEventAttributes: { scheduledEventId: '5' },
        },
        {
          eventId: '10',
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED',
          eventTime: '2026-03-29T13:17:20Z',
          workflowExecutionCompletedEventAttributes: {
            result: {
              payloads: [{
                output: { topic: 'renewable energy' },
                status: 'completed',
                executedNodes: ['webResearcher', 'writer'],
              }],
            },
          },
        },
      ],
    };

    const parsed = parseFullHistory(history);

    expect(parsed.workflowType).toBe('agentResearch');
    expect(parsed.taskQueue).toBe('durion-graph-pipeline');
    expect(parsed.input).toEqual({ topic: 'renewable energy' });
    expect(parsed.executedNodes).toEqual(['webResearcher', 'writer']);
    expect(parsed.events).toHaveLength(5);
    expect(parsed.events[0].label).toBe('WorkflowStarted (agentResearch)');
    expect(parsed.events[1].label).toBe('ActivityScheduled: runModel');
    expect(parsed.activitySteps).toHaveLength(1);
    expect(parsed.activitySteps[0].activityName).toBe('runModel');
    expect(parsed.activitySpans).toHaveLength(1);
    expect(parsed.activitySpans[0].activityName).toBe('runModel');
    expect(parsed.activitySpans[0].outcome).toBe('completed');
    expect(parsed.activitySpans[0].startedAt).toBe(Date.parse('2026-03-29T13:16:53Z'));
    expect(parsed.activitySpans[0].endedAt).toBe(Date.parse('2026-03-29T13:17:10Z'));
    expect(parsed.historyStartMs).toBe(Date.parse('2026-03-29T13:16:51Z'));
    expect(parsed.events[4].label).toBe('WorkflowCompleted');
  });

  it('extracts topology from memo', () => {
    const history = {
      events: [
        {
          eventId: '1',
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED',
          workflowExecutionStartedEventAttributes: {
            workflowType: { name: 'myGraph' },
            taskQueue: { name: 'test-queue' },
            memo: {
              'durion:topology': {
                nodes: ['a', 'b'],
                edges: [{ from: 'a', to: 'b', type: 'static' }],
              },
            },
          },
        },
      ],
    };

    const parsed = parseFullHistory(history);
    expect(parsed.topology).toEqual({
      nodes: ['a', 'b'],
      edges: [{ from: 'a', to: 'b', type: 'static' }],
    });
  });

  it('returns empty parsed history for null input', () => {
    const parsed = parseFullHistory(null);
    expect(parsed.events).toEqual([]);
    expect(parsed.input).toBeNull();
    expect(parsed.result).toBeNull();
    expect(parsed.activitySpans).toEqual([]);
    expect(parsed.childWorkflowSteps).toEqual([]);
    expect(parsed.childWorkflowSpans).toEqual([]);
  });

  it('reads task queue when workflow start uses a string taskQueue field', () => {
    const history = {
      events: [
        {
          eventId: '1',
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED',
          workflowExecutionStartedEventAttributes: {
            workflowType: { name: 'researchPipeline' },
            taskQueue: 'durion-graph-pipeline',
            input: { payloads: [] },
            memo: {},
          },
        },
      ],
    };
    expect(parseFullHistory(history).taskQueue).toBe('durion-graph-pipeline');
  });

  it('decodes base64 JSON workflow result payloads (Temporal history JSON)', () => {
    const graphResult = {
      status: 'max_iterations',
      executedNodes: ['research', 'evaluate'],
      totalUsage: { totalTokens: 2755 },
      output: {},
    };
    const history = {
      events: [
        {
          eventId: '1',
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED',
          workflowExecutionStartedEventAttributes: {
            workflowType: { name: 'researchPipeline' },
            taskQueue: { name: 'durion-graph-pipeline' },
            input: { payloads: [] },
            memo: {},
          },
        },
        {
          eventId: '2',
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED',
          workflowExecutionCompletedEventAttributes: {
            result: {
              payloads: [
                {
                  metadata: { encoding: 'json/plain' },
                  data: btoa(JSON.stringify(graphResult)),
                },
              ],
            },
          },
        },
      ],
    };

    const parsed = parseFullHistory(history);
    expect(parsed.result).toEqual(graphResult);
    expect(parsed.executedNodes).toEqual(['research', 'evaluate']);
  });

  it('parses protobuf-JSON Timestamp-shaped eventTime for activity spans', () => {
    const msToProto = (ms: number) => ({
      seconds: String(Math.floor(ms / 1000)),
      nanos: Math.round((ms % 1000) * 1_000_000),
    });
    const tWf = 1_700_000_100;
    const tSch = 1_700_000_200;
    const tSt = 1_700_000_300;
    const tEn = 1_700_000_400;
    const history = {
      events: [
        {
          eventId: '1',
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED',
          eventTime: msToProto(tWf),
          workflowExecutionStartedEventAttributes: {
            workflowType: { name: 'wf' },
            taskQueue: { name: 'q' },
            input: { payloads: [] },
            memo: {},
          },
        },
        {
          eventId: '5',
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_SCHEDULED',
          eventTime: msToProto(tSch),
          activityTaskScheduledEventAttributes: {
            activityType: { name: 'runModel' },
          },
        },
        {
          eventId: '6',
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_STARTED',
          eventTime: msToProto(tSt),
          activityTaskStartedEventAttributes: { scheduledEventId: '5' },
        },
        {
          eventId: '7',
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_COMPLETED',
          eventTime: msToProto(tEn),
          activityTaskCompletedEventAttributes: { scheduledEventId: '5' },
        },
      ],
    };

    const parsed = parseFullHistory(history);
    expect(parsed.activitySpans).toHaveLength(1);
    const span = parsed.activitySpans[0];
    expect(span.scheduledAt).toBe(tSch);
    expect(span.startedAt).toBe(tSt);
    expect(span.endedAt).toBe(tEn);
    expect(parsed.historyStartMs).toBe(tWf);
    expect(parsed.historyEndMs).toBe(tEn);
    expect(parsed.events.map((ev) => ev.eventTime)).toEqual([
      new Date(tWf).toISOString(),
      new Date(tSch).toISOString(),
      new Date(tSt).toISOString(),
      new Date(tEn).toISOString(),
    ]);
  });

  it('parses child workflow initiated → started → completed with labels and spans', () => {
    const history = {
      events: [
        {
          eventId: '1',
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED',
          eventTime: '2026-03-30T10:00:00Z',
          workflowExecutionStartedEventAttributes: {
            workflowType: { name: 'composabilityParent' },
            taskQueue: { name: 'q' },
            input: { payloads: [{ message: 'hi' }] },
            memo: {},
          },
        },
        {
          eventId: '4',
          eventType: 'EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED',
          eventTime: '2026-03-30T10:00:01Z',
          startChildWorkflowExecutionInitiatedEventAttributes: {
            workflowId: 'child-wf-abc',
            workflowType: { name: 'composabilityChild' },
            input: { payloads: [{ text: 'hello' }] },
          },
        },
        {
          eventId: '5',
          eventType: 'EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED',
          eventTime: '2026-03-30T10:00:02Z',
          childWorkflowExecutionStartedEventAttributes: {
            initiatedEventId: '4',
            workflowExecution: { workflowId: 'child-wf-abc', runId: 'run-xyz' },
            workflowType: { name: 'composabilityChild' },
          },
        },
        {
          eventId: '6',
          eventType: 'EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_COMPLETED',
          eventTime: '2026-03-30T10:00:05Z',
          childWorkflowExecutionCompletedEventAttributes: {
            initiatedEventId: '4',
            workflowExecution: { workflowId: 'child-wf-abc', runId: 'run-xyz' },
            result: { payloads: [{ processed: 'HELLO' }] },
          },
        },
        {
          eventId: '7',
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED',
          eventTime: '2026-03-30T10:00:06Z',
          workflowExecutionCompletedEventAttributes: {
            result: { payloads: [{ ok: true }] },
          },
        },
      ],
    };

    const parsed = parseFullHistory(history);
    expect(parsed.childWorkflowSteps).toHaveLength(1);
    const cw = parsed.childWorkflowSteps[0];
    expect(cw.initiatedEventId).toBe('4');
    expect(cw.workflowType).toBe('composabilityChild');
    expect(cw.workflowId).toBe('child-wf-abc');
    expect(cw.runId).toBe('run-xyz');
    expect(cw.outcome).toBe('completed');
    expect(cw.input).toEqual({ text: 'hello' });
    expect(cw.result).toEqual({ processed: 'HELLO' });

    expect(parsed.childWorkflowSpans).toHaveLength(1);
    expect(parsed.childWorkflowSpans[0].key).toBe('4');
    expect(parsed.childWorkflowSpans[0].activityName).toBe('Child: composabilityChild');
    expect(parsed.childWorkflowSpans[0].outcome).toBe('completed');
    expect(parsed.childWorkflowSpans[0].scheduledAt).toBe(Date.parse('2026-03-30T10:00:01Z'));
    expect(parsed.childWorkflowSpans[0].startedAt).toBe(Date.parse('2026-03-30T10:00:02Z'));
    expect(parsed.childWorkflowSpans[0].endedAt).toBe(Date.parse('2026-03-30T10:00:05Z'));

    const initiatedEv = parsed.events.find((e) => e.eventId === '4');
    expect(initiatedEv?.label).toBe('ChildInitiated (composabilityChild)');
    const startedEv = parsed.events.find((e) => e.eventId === '5');
    expect(startedEv?.label).toBe('ChildStarted (composabilityChild)');
  });

  it('parses start child workflow execution failed', () => {
    const history = {
      events: [
        {
          eventId: '1',
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED',
          workflowExecutionStartedEventAttributes: {
            workflowType: { name: 'parent' },
            taskQueue: { name: 'q' },
            input: { payloads: [] },
            memo: {},
          },
        },
        {
          eventId: '3',
          eventType: 'EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_INITIATED',
          eventTime: '2026-03-30T12:00:00Z',
          startChildWorkflowExecutionInitiatedEventAttributes: {
            workflowId: 'child-1',
            workflowType: { name: 'childType' },
            input: { payloads: [] },
          },
        },
        {
          eventId: '4',
          eventType: 'EVENT_TYPE_START_CHILD_WORKFLOW_EXECUTION_FAILED',
          eventTime: '2026-03-30T12:00:01Z',
          startChildWorkflowExecutionFailedEventAttributes: {
            initiatedEventId: '3',
            workflowId: 'child-1',
            workflowType: { name: 'childType' },
            cause: 'WORKFLOW_ALREADY_EXISTS',
          },
        },
      ],
    };

    const parsed = parseFullHistory(history);
    expect(parsed.childWorkflowSteps).toHaveLength(1);
    expect(parsed.childWorkflowSteps[0].outcome).toBe('start_failed');
    expect(parsed.childWorkflowSteps[0].initiatedEventId).toBe('3');
    expect(parsed.childWorkflowSpans[0].outcome).toBe('failed');
  });
});

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
    expect(parsed.events).toHaveLength(3);
    expect(parsed.events[0].label).toBe('WorkflowStarted (agentResearch)');
    expect(parsed.events[1].label).toBe('ActivityScheduled: runModel');
    expect(parsed.events[2].label).toBe('WorkflowCompleted');
    expect(parsed.activitySteps).toHaveLength(1);
    expect(parsed.activitySteps[0].activityName).toBe('runModel');
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
  });
});

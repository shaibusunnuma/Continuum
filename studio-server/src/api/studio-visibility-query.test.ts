import { describe, expect, it } from 'vitest';
import {
  buildStudioRunsStructuredQuery,
  mergeStudioRunsVisibilityQuery,
} from './studio-visibility-query';

describe('buildStudioRunsStructuredQuery', () => {
  it('returns undefined for empty params', () => {
    expect(buildStudioRunsStructuredQuery({})).toBeUndefined();
  });

  it('adds roots composition', () => {
    expect(buildStudioRunsStructuredQuery({ composition: 'roots' })).toBe(
      'ParentWorkflowId IS NULL',
    );
  });

  it('adds children composition', () => {
    expect(buildStudioRunsStructuredQuery({ composition: 'children' })).toBe(
      'ParentWorkflowId IS NOT NULL',
    );
  });

  it('quotes parent workflow id and escapes quotes', () => {
    expect(
      buildStudioRunsStructuredQuery({ parentWorkflowId: 'parent-wf' }),
    ).toBe('ParentWorkflowId = "parent-wf"');
    expect(
      buildStudioRunsStructuredQuery({ parentWorkflowId: 'say "hi"' }),
    ).toBe('ParentWorkflowId = "say \\"hi\\""');
  });

  it('adds ParentRunId only with parentWorkflowId', () => {
    expect(
      buildStudioRunsStructuredQuery({
        parentWorkflowId: 'p',
        parentRunId: '019d-abc',
      }),
    ).toBe('ParentWorkflowId = "p" AND ParentRunId = "019d-abc"');
    expect(
      buildStudioRunsStructuredQuery({ parentRunId: 'orphan-only' }),
    ).toBeUndefined();
  });

  it('maps execution status to Temporal literals', () => {
    expect(
      buildStudioRunsStructuredQuery({ executionStatus: 'RUNNING' }),
    ).toBe('ExecutionStatus = "Running"');
  });

  it('combines workflow id and composition', () => {
    const q = buildStudioRunsStructuredQuery({
      workflowId: 'wf-1',
      composition: 'children',
    });
    expect(q).toBe('WorkflowId = "wf-1" AND ParentWorkflowId IS NOT NULL');
  });

  it('ignores invalid startAfter / startBefore', () => {
    expect(
      buildStudioRunsStructuredQuery({
        startAfter: 'not-a-date',
        startBefore: '',
      }),
    ).toBeUndefined();
  });

  it('uses ISO StartTime for valid dates', () => {
    const q = buildStudioRunsStructuredQuery({
      startAfter: '2024-01-15T12:00:00.000Z',
      startBefore: '2024-01-20T00:00:00.000Z',
    });
    expect(q).toContain('StartTime >=');
    expect(q).toContain('StartTime <=');
    expect(q).toContain('2024-01-15T12:00:00.000Z');
    expect(q).toContain('2024-01-20T00:00:00.000Z');
  });

  it('parentWorkflowId wins over composition roots/children', () => {
    const q = buildStudioRunsStructuredQuery({
      composition: 'roots',
      parentWorkflowId: 'parent-x',
    });
    expect(q).toBe('ParentWorkflowId = "parent-x"');
    expect(q).not.toContain('IS NULL');
  });
});

describe('mergeStudioRunsVisibilityQuery', () => {
  it('returns structured only', () => {
    expect(mergeStudioRunsVisibilityQuery('A = 1', undefined)).toBe('A = 1');
  });

  it('returns raw only', () => {
    expect(mergeStudioRunsVisibilityQuery(undefined, 'Custom = "x"')).toBe('Custom = "x"');
  });

  it('AND-wraps both', () => {
    expect(mergeStudioRunsVisibilityQuery('A = 1', 'B = 2')).toBe('(A = 1) AND (B = 2)');
  });

  it('trims whitespace', () => {
    expect(mergeStudioRunsVisibilityQuery('  x  ', '  y  ')).toBe('(x) AND (y)');
  });
});

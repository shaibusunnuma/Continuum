import { describe, it, expect } from 'vitest';
import {
  buildStudioRunsStructuredQuery,
  mergeStudioRunsVisibilityQuery,
} from '../../src/gateway/visibility-query';

describe('buildStudioRunsStructuredQuery', () => {
  it('returns undefined for empty params', () => {
    expect(buildStudioRunsStructuredQuery({})).toBeUndefined();
  });

  it('maps execution status to Temporal literals', () => {
    expect(buildStudioRunsStructuredQuery({ executionStatus: 'RUNNING' }))
      .toBe('ExecutionStatus = "Running"');
    expect(buildStudioRunsStructuredQuery({ executionStatus: 'FAILED' }))
      .toBe('ExecutionStatus = "Failed"');
    expect(buildStudioRunsStructuredQuery({ executionStatus: 'CANCELLED' }))
      .toBe('ExecutionStatus = "Canceled"');
  });

  it('filters by workflowType', () => {
    expect(buildStudioRunsStructuredQuery({ workflowType: 'hello' }))
      .toBe('WorkflowType = "hello"');
  });

  it('adds roots composition', () => {
    expect(buildStudioRunsStructuredQuery({ composition: 'roots' }))
      .toBe('ParentWorkflowId IS NULL');
  });

  it('adds children composition', () => {
    expect(buildStudioRunsStructuredQuery({ composition: 'children' }))
      .toBe('ParentWorkflowId IS NOT NULL');
  });

  it('parentWorkflowId takes precedence over composition', () => {
    const q = buildStudioRunsStructuredQuery({
      composition: 'roots',
      parentWorkflowId: 'parent-1',
    });
    expect(q).toBe('ParentWorkflowId = "parent-1"');
    expect(q).not.toContain('IS NULL');
  });

  it('combines parentWorkflowId and parentRunId', () => {
    expect(buildStudioRunsStructuredQuery({
      parentWorkflowId: 'p',
      parentRunId: 'r-123',
    })).toBe('ParentWorkflowId = "p" AND ParentRunId = "r-123"');
  });

  it('ignores invalid dates', () => {
    expect(buildStudioRunsStructuredQuery({ startAfter: 'not-a-date' })).toBeUndefined();
  });

  it('handles valid date ranges', () => {
    const q = buildStudioRunsStructuredQuery({
      startAfter: '2025-01-01T00:00:00Z',
      startBefore: '2025-12-31T23:59:59Z',
    });
    expect(q).toContain('StartTime >=');
    expect(q).toContain('StartTime <=');
  });

  it('escapes quotes in values', () => {
    expect(buildStudioRunsStructuredQuery({ workflowId: 'say "hi"' }))
      .toBe('WorkflowId = "say \\"hi\\""');
  });

  it('combines multiple filters with AND', () => {
    const q = buildStudioRunsStructuredQuery({
      executionStatus: 'COMPLETED',
      workflowType: 'hello',
    });
    expect(q).toBe('ExecutionStatus = "Completed" AND WorkflowType = "hello"');
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

  it('returns undefined when both are empty', () => {
    expect(mergeStudioRunsVisibilityQuery(undefined, undefined)).toBeUndefined();
    expect(mergeStudioRunsVisibilityQuery('', '')).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(mergeStudioRunsVisibilityQuery('  x  ', '  y  ')).toBe('(x) AND (y)');
  });
});

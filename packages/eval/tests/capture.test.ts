import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock config to control evaluation enabled state
vi.mock('../src/config', () => ({
  isEvaluationEnabled: vi.fn(),
  withDefaultVariantName: vi.fn((p: any) => ({ ...p, variantName: p.variantName ?? 'baseline' })),
}));

// Mock store to verify DB operations
vi.mock('../src/store', () => ({
  ensureVariant: vi.fn().mockResolvedValue({ id: 'v-1', name: 'baseline' }),
  insertRun: vi.fn().mockResolvedValue({ id: 'r-1' }),
  insertExample: vi.fn().mockResolvedValue({ id: 'e-1' }),
}));

import { recordEvalRun } from '../src/capture';
import { isEvaluationEnabled } from '../src/config';
import { ensureVariant, insertRun, insertExample } from '../src/store';

describe('capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops when evaluation is disabled', async () => {
    vi.mocked(isEvaluationEnabled).mockReturnValue(false);
    await recordEvalRun({
      kind: 'workflow',
      name: 'testWorkflow',
      workflowId: 'wf-1',
      runId: 'run-1',
      input: { x: 1 },
      output: { y: 2 },
    });
    expect(ensureVariant).not.toHaveBeenCalled();
    expect(insertRun).not.toHaveBeenCalled();
    expect(insertExample).not.toHaveBeenCalled();
  });

  it('calls store functions in correct order when enabled', async () => {
    vi.mocked(isEvaluationEnabled).mockReturnValue(true);
    const callOrder: string[] = [];
    vi.mocked(ensureVariant).mockImplementation(async () => {
      callOrder.push('ensureVariant');
      return { id: 'v-1', name: 'baseline' } as any;
    });
    vi.mocked(insertRun).mockImplementation(async () => {
      callOrder.push('insertRun');
      return { id: 'r-1' } as any;
    });
    vi.mocked(insertExample).mockImplementation(async () => {
      callOrder.push('insertExample');
      return { id: 'e-1' } as any;
    });

    await recordEvalRun({
      kind: 'workflow',
      name: 'testWorkflow',
      workflowId: 'wf-1',
      runId: 'run-1',
      input: { x: 1 },
      output: { y: 2 },
    });

    expect(callOrder).toEqual(['ensureVariant', 'insertRun', 'insertExample']);
  });

  it('passes correct params to ensureVariant', async () => {
    vi.mocked(isEvaluationEnabled).mockReturnValue(true);
    await recordEvalRun({
      kind: 'agent',
      name: 'testAgent',
      workflowId: 'wf-2',
      runId: 'run-2',
      input: {},
      output: {},
      variantName: 'prompt_v2',
      modelId: 'gpt-4o',
    });

    expect(ensureVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        variantName: 'prompt_v2',
        modelId: 'gpt-4o',
      }),
    );
  });

  it('does not throw when store operations fail (fail-safe)', async () => {
    vi.mocked(isEvaluationEnabled).mockReturnValue(true);
    vi.mocked(ensureVariant).mockRejectedValue(new Error('DB connection failed'));

    // Should not throw
    await expect(
      recordEvalRun({
        kind: 'workflow',
        name: 'test',
        workflowId: 'wf-3',
        runId: 'run-3',
        input: {},
        output: {},
      }),
    ).resolves.toBeUndefined();
  });
});

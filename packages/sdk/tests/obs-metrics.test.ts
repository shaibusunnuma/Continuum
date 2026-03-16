import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockCounterAdd = vi.fn();
vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeterProvider: () => ({
      getMeter: () => ({
        createCounter: () => ({ add: mockCounterAdd }),
      }),
    }),
  },
}));

vi.mock('../src/sdk/obs', () => ({
  isMetricsEnabled: vi.fn(),
}));

import { recordModelCall, recordModelTokens, recordModelCost, recordToolCall } from '../src/sdk/obs-metrics';
import { isMetricsEnabled } from '../src/sdk/obs';

describe('obs-metrics', () => {
  beforeEach(() => {
    vi.mocked(isMetricsEnabled).mockReturnValue(false);
    mockCounterAdd.mockClear();
  });

  describe('when metrics disabled', () => {
    it('recordModelCall does not call counter add', () => {
      recordModelCall({
        model: 'gpt-4',
        provider: 'openai',
        status: 'success',
      });
      expect(mockCounterAdd).not.toHaveBeenCalled();
    });

    it('recordToolCall does not call counter add', () => {
      recordToolCall({ tool: 'calc', status: 'success' });
      expect(mockCounterAdd).not.toHaveBeenCalled();
    });
  });

  describe('when metrics enabled', () => {
    beforeEach(() => {
      vi.mocked(isMetricsEnabled).mockReturnValue(true);
    });

    it('recordModelCall calls add with 1 and attributes', () => {
      recordModelCall({
        model: 'gpt-4',
        provider: 'openai',
        status: 'success',
        workflow: 'myWorkflow',
      });
      expect(mockCounterAdd).toHaveBeenCalledWith(1, {
        model: 'gpt-4',
        provider: 'openai',
        status: 'success',
        workflow: 'myWorkflow',
      });
    });

    it('recordModelTokens calls add with count and attributes', () => {
      recordModelTokens('gpt-4', 'openai', 'prompt', 100);
      expect(mockCounterAdd).toHaveBeenCalledWith(100, {
        model: 'gpt-4',
        provider: 'openai',
        type: 'prompt',
      });
    });

    it('recordModelCost calls add with costUsd and attributes', () => {
      recordModelCost('gpt-4', 'openai', 0.002);
      expect(mockCounterAdd).toHaveBeenCalledWith(0.002, {
        model: 'gpt-4',
        provider: 'openai',
      });
    });

    it('recordToolCall calls add with 1 and attributes', () => {
      recordToolCall({
        tool: 'calculator',
        status: 'success',
        agent: 'reactAgent',
      });
      expect(mockCounterAdd).toHaveBeenCalledWith(1, {
        tool: 'calculator',
        status: 'success',
        agent: 'reactAgent',
      });
    });
  });
});

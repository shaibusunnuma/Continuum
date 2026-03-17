import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the plugin module to prevent actual hook registration
vi.mock('../src/plugin', () => ({
  registerEvalHook: vi.fn(),
}));

// Mock the store module to prevent actual DB connections
vi.mock('../src/store', () => ({
  shutdownPool: vi.fn().mockResolvedValue(undefined),
}));

import {
  initEvaluation,
  shutdownEvaluation,
} from '../src/config';
import {
  isEvaluationEnabled,
  getEvaluationDbUrl,
  getDefaultVariantName,
  getPoolConfig,
  withDefaultVariantName,
} from '../src/config';
import { registerEvalHook } from '../src/plugin';

describe('config', () => {
  beforeEach(() => {
    // Reset to disabled state
    initEvaluation({ enabled: false });
    vi.clearAllMocks();
  });

  describe('initEvaluation', () => {
    it('enables evaluation when enabled=true and dbUrl provided', () => {
      initEvaluation({ enabled: true, dbUrl: 'postgres://localhost/test' });
      expect(isEvaluationEnabled()).toBe(true);
      expect(getEvaluationDbUrl()).toBe('postgres://localhost/test');
      expect(registerEvalHook).toHaveBeenCalledTimes(1);
    });

    it('disables evaluation when enabled=false', () => {
      initEvaluation({ enabled: false });
      expect(isEvaluationEnabled()).toBe(false);
      expect(registerEvalHook).not.toHaveBeenCalled();
    });

    it('disables evaluation when enabled=true but dbUrl missing', () => {
      initEvaluation({ enabled: true });
      expect(isEvaluationEnabled()).toBe(false);
      expect(registerEvalHook).not.toHaveBeenCalled();
    });

    it('sets defaultVariantName from options', () => {
      initEvaluation({
        enabled: true,
        dbUrl: 'postgres://localhost/test',
        defaultVariantName: 'prompt_v2',
      });
      expect(getDefaultVariantName()).toBe('prompt_v2');
    });

    it('defaults variant name to "baseline"', () => {
      initEvaluation({ enabled: true, dbUrl: 'postgres://localhost/test' });
      expect(getDefaultVariantName()).toBe('baseline');
    });

    it('stores pool config when provided', () => {
      initEvaluation({
        enabled: true,
        dbUrl: 'postgres://localhost/test',
        pool: { max: 10, idleTimeoutMillis: 60000 },
      });
      expect(getPoolConfig()).toEqual({ max: 10, idleTimeoutMillis: 60000 });
    });

    it('returns undefined pool config when not provided', () => {
      initEvaluation({ enabled: true, dbUrl: 'postgres://localhost/test' });
      expect(getPoolConfig()).toBeUndefined();
    });
  });

  describe('withDefaultVariantName', () => {
    it('returns params unchanged when variantName is set', () => {
      const params = { variantName: 'custom', kind: 'workflow' as const, name: 'test' };
      expect(withDefaultVariantName(params)).toBe(params);
    });

    it('adds default variant name when not set', () => {
      initEvaluation({ enabled: true, dbUrl: 'postgres://localhost/test', defaultVariantName: 'v2' });
      const params = { kind: 'workflow' as const, name: 'test' };
      const result = withDefaultVariantName(params);
      expect(result.variantName).toBe('v2');
    });
  });

  describe('shutdownEvaluation', () => {
    it('shuts down pool and disables evaluation', async () => {
      initEvaluation({ enabled: true, dbUrl: 'postgres://localhost/test' });
      expect(isEvaluationEnabled()).toBe(true);
      await shutdownEvaluation();
      expect(isEvaluationEnabled()).toBe(false);
    });
  });
});

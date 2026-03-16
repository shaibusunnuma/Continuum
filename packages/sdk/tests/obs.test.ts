import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initObservability,
  isTracingEnabled,
  isMetricsEnabled,
  withSpan,
} from '../src/sdk/obs';

describe('obs', () => {
  beforeEach(() => {
    initObservability({ tracing: { enabled: false }, metrics: { enabled: false } });
  });

  describe('initObservability / isTracingEnabled / isMetricsEnabled', () => {
    it('tracing disabled by default after init', () => {
      initObservability({});
      expect(isTracingEnabled()).toBe(false);
      expect(isMetricsEnabled()).toBe(false);
    });

    it('tracing enabled when config.tracing.enabled is true', () => {
      initObservability({ tracing: { enabled: true } });
      expect(isTracingEnabled()).toBe(true);
    });

    it('metrics enabled when config.metrics.enabled is true', () => {
      initObservability({ metrics: { enabled: true } });
      expect(isMetricsEnabled()).toBe(true);
    });
  });

  describe('withSpan', () => {
    it('calls fn(null) and returns result when tracing disabled', async () => {
      const result = await withSpan('test', {}, async (span) => {
        expect(span).toBeNull();
        return 42;
      });
      expect(result).toBe(42);
    });

    it('when tracing disabled, passes attributes through to fn only via closure', async () => {
      const result = await withSpan('test', { attr: 'value' }, async (s) => {
        expect(s).toBeNull();
        return 100;
      });
      expect(result).toBe(100);
    });
  });
});

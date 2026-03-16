import { describe, it, expect } from 'vitest';
import { calculateCostUsd } from '../../src/sdk/ai/cost';

describe('cost', () => {
  describe('calculateCostUsd', () => {
    it('returns a number >= 0', async () => {
      const result = await calculateCostUsd('openai', 'gpt-4o-mini', {
        promptTokens: 10,
        completionTokens: 5,
      });
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 or positive cost for zero tokens (graceful when pricing unavailable)', async () => {
      const result = await calculateCostUsd('openai', 'gpt-4o-mini', {
        promptTokens: 0,
        completionTokens: 0,
      });
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('accepts different provider and model ids', async () => {
      const result = await calculateCostUsd('anthropic', 'claude-3-5-sonnet-20241022', {
        promptTokens: 1,
        completionTokens: 1,
      });
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });
});

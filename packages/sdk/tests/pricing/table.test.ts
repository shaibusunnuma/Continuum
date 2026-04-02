import { describe, expect, it } from 'vitest';
import {
  createTableCostCalculator,
  pricingProviderMatches,
  resolvePricingRow,
  type PricingRow,
} from '../../src/sdk/pricing';

const rows: PricingRow[] = [
  {
    provider: 'openai',
    modelPattern: 'gpt-4o-mini',
    effectiveFrom: '2024-01-01T00:00:00.000Z',
    inputUsdPer1M: 1,
    outputUsdPer1M: 2,
  },
  {
    provider: 'openai',
    modelPattern: 'gpt-4o-mini',
    effectiveFrom: '2025-06-01T00:00:00.000Z',
    inputUsdPer1M: 0.5,
    outputUsdPer1M: 1,
  },
  {
    provider: 'anthropic',
    modelPattern: 'claude-3',
    effectiveFrom: '2024-01-01T00:00:00.000Z',
    inputUsdPer1M: 3,
    outputUsdPer1M: 4,
  },
];

describe('pricingProviderMatches', () => {
  it('matches openai row to openai.chat from Vercel AI SDK', () => {
    expect(pricingProviderMatches('openai', 'openai.chat')).toBe(true);
    expect(pricingProviderMatches('openai', 'openai')).toBe(true);
    expect(pricingProviderMatches('openai.chat', 'openai.chat')).toBe(true);
    expect(pricingProviderMatches('openai', 'anthropic')).toBe(false);
  });
});

describe('resolvePricingRow', () => {
  it('returns null when no row matches provider', () => {
    expect(
      resolvePricingRow(rows, {
        provider: 'xai',
        model: 'gpt-4o-mini',
        atMs: Date.parse('2025-07-01T00:00:00.000Z'),
      }),
    ).toBeNull();
  });

  it('returns null when no row matches model', () => {
    expect(
      resolvePricingRow(rows, {
        provider: 'openai',
        model: 'gpt-4o',
        atMs: Date.parse('2025-07-01T00:00:00.000Z'),
      }),
    ).toBeNull();
  });

  it('picks latest effectiveFrom not after atMs', () => {
    const at = Date.parse('2025-03-01T00:00:00.000Z');
    const r = resolvePricingRow(rows, { provider: 'openai', model: 'gpt-4o-mini', atMs: at });
    expect(r?.inputUsdPer1M).toBe(1);
    expect(r?.effectiveFrom).toBe('2024-01-01T00:00:00.000Z');
  });

  it('uses newer row after effectiveFrom', () => {
    const at = Date.parse('2025-07-01T00:00:00.000Z');
    const r = resolvePricingRow(rows, { provider: 'openai', model: 'gpt-4o-mini', atMs: at });
    expect(r?.inputUsdPer1M).toBe(0.5);
    expect(r?.effectiveFrom).toBe('2025-06-01T00:00:00.000Z');
  });

  it('matches row when model reports openai.chat', () => {
    const at = Date.parse('2025-07-01T00:00:00.000Z');
    const r = resolvePricingRow(rows, { provider: 'openai.chat', model: 'gpt-4o-mini', atMs: at });
    expect(r).not.toBeNull();
    expect(r?.inputUsdPer1M).toBe(0.5);
  });
});

describe('createTableCostCalculator', () => {
  it('returns cost and table attribution', async () => {
    const calc = createTableCostCalculator('tbl-a', rows);
    const out = await calc.calculate({
      inputTokens: 2_000_000,
      outputTokens: 1_000_000,
      model: 'gpt-4o-mini',
      provider: 'openai',
      requestedAtMs: Date.parse('2025-07-01T00:00:00.000Z'),
      metadata: { retries: 0, latencyMs: 10 },
    });
    expect(typeof out).toBe('object');
    if (typeof out === 'number') throw new Error('expected object');
    expect(out.costUsd).toBe(2); // 2*0.5 + 1*1
    expect(out.attribution?.kind).toBe('table');
    expect(out.attribution?.pricingTableId).toBe('tbl-a');
    expect(out.attribution?.pricingEffectiveAt).toBe('2025-06-01T00:00:00.000Z');
  });

  it('returns unknown attribution when no row', async () => {
    const calc = createTableCostCalculator('tbl-b', rows);
    const out = await calc.calculate({
      inputTokens: 100,
      outputTokens: 100,
      model: 'unknown-model',
      provider: 'openai',
      requestedAtMs: Date.now(),
      metadata: { retries: 0, latencyMs: 1 },
    });
    if (typeof out === 'number') throw new Error('expected object');
    expect(out.costUsd).toBe(0);
    expect(out.attribution?.kind).toBe('unknown');
    expect(out.attribution?.pricingTableId).toBe('tbl-b');
  });
});

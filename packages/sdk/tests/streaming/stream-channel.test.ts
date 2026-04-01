import { describe, expect, it } from 'vitest';
import { redisStreamChannelKey } from '../../src/sdk/streaming/stream-channel';

describe('redisStreamChannelKey', () => {
  it('uses workflow id only when run id missing', () => {
    expect(redisStreamChannelKey('wf-a')).toBe('wf-a');
    expect(redisStreamChannelKey('wf-a', undefined)).toBe('wf-a');
    expect(redisStreamChannelKey('wf-a', '')).toBe('wf-a');
    expect(redisStreamChannelKey('wf-a', '   ')).toBe('wf-a');
  });

  it('suffixes temporal run id', () => {
    expect(redisStreamChannelKey('wf-a', 'run-1')).toBe('wf-a::run-1');
  });
});

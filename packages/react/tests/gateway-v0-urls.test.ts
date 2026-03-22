import { describe, expect, it } from 'vitest';
import {
  gatewayV0AgentsStartUrl,
  gatewayV0ResultUrl,
  gatewayV0SignalUrl,
  gatewayV0StreamStateUrl,
  gatewayV0TokenStreamUrl,
  gatewayV0WorkflowsStartUrl,
  trimGatewayBase,
} from '../src/gateway-v0/urls';

describe('trimGatewayBase', () => {
  it('strips trailing slash', () => {
    expect(trimGatewayBase('https://api.example.com/')).toBe('https://api.example.com');
  });

  it('leaves base without slash unchanged', () => {
    expect(trimGatewayBase('https://api.example.com')).toBe('https://api.example.com');
  });

  it('handles empty string', () => {
    expect(trimGatewayBase('')).toBe('');
  });
});

describe('gatewayV0StreamStateUrl', () => {
  it('joins base and encodes run id', () => {
    expect(gatewayV0StreamStateUrl('http://localhost:3000', 'run-1')).toBe(
      'http://localhost:3000/v0/runs/run-1/stream-state',
    );
    expect(gatewayV0StreamStateUrl('', 'a/b')).toBe('/v0/runs/a%2Fb/stream-state');
  });
});

describe('gatewayV0TokenStreamUrl', () => {
  it('returns path without token', () => {
    expect(gatewayV0TokenStreamUrl('http://h', 'r1')).toBe('http://h/v0/runs/r1/token-stream');
  });

  it('appends access_token query', () => {
    expect(gatewayV0TokenStreamUrl('http://h', 'r1', { accessToken: 'tok&x' })).toBe(
      'http://h/v0/runs/r1/token-stream?access_token=tok%26x',
    );
  });

  it('uses & when URL already contains ?', () => {
    expect(gatewayV0TokenStreamUrl('http://h?q=1', 'r', { accessToken: 't' })).toBe(
      'http://h?q=1/v0/runs/r/token-stream&access_token=t',
    );
  });
});

describe('gatewayV0SignalUrl / gatewayV0ResultUrl / gatewayV0WorkflowsStartUrl / gatewayV0AgentsStartUrl', () => {
  it('builds expected paths', () => {
    expect(gatewayV0SignalUrl('http://x', 'id')).toBe('http://x/v0/runs/id/signal');
    expect(gatewayV0ResultUrl('http://x', 'id')).toBe('http://x/v0/runs/id/result');
    expect(gatewayV0WorkflowsStartUrl('http://x')).toBe('http://x/v0/workflows/start');
    expect(gatewayV0AgentsStartUrl('http://x')).toBe('http://x/v0/agents/start');
  });
});

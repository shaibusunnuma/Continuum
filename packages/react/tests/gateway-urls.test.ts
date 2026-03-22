import { describe, expect, it } from 'vitest';
import {
  gatewayAgentsStartUrl,
  gatewayResultUrl,
  gatewaySignalUrl,
  gatewayStreamStateUrl,
  gatewayTokenStreamUrl,
  gatewayWorkflowsStartUrl,
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

describe('gatewayStreamStateUrl', () => {
  it('joins base and encodes run id', () => {
    expect(gatewayStreamStateUrl('http://localhost:3000', 'run-1')).toBe(
      'http://localhost:3000/v0/runs/run-1/stream-state',
    );
    expect(gatewayStreamStateUrl('', 'a/b')).toBe('/v0/runs/a%2Fb/stream-state');
  });
});

describe('gatewayTokenStreamUrl', () => {
  it('returns path without token', () => {
    expect(gatewayTokenStreamUrl('http://h', 'r1')).toBe('http://h/v0/runs/r1/token-stream');
  });

  it('appends access_token query', () => {
    expect(gatewayTokenStreamUrl('http://h', 'r1', { accessToken: 'tok&x' })).toBe(
      'http://h/v0/runs/r1/token-stream?access_token=tok%26x',
    );
  });

  it('uses & when URL already contains ?', () => {
    expect(gatewayTokenStreamUrl('http://h?q=1', 'r', { accessToken: 't' })).toBe(
      'http://h?q=1/v0/runs/r/token-stream&access_token=t',
    );
  });
});

describe('gatewaySignalUrl / gatewayResultUrl / gatewayWorkflowsStartUrl / gatewayAgentsStartUrl', () => {
  it('builds expected paths', () => {
    expect(gatewaySignalUrl('http://x', 'id')).toBe('http://x/v0/runs/id/signal');
    expect(gatewayResultUrl('http://x', 'id')).toBe('http://x/v0/runs/id/result');
    expect(gatewayWorkflowsStartUrl('http://x')).toBe('http://x/v0/workflows/start');
    expect(gatewayAgentsStartUrl('http://x')).toBe('http://x/v0/agents/start');
  });
});

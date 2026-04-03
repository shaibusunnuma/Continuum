import { describe, it, expect } from 'vitest';
import { parseAddress } from '../src/temporal';

describe('parseAddress', () => {
  it('parses host:port', () => {
    expect(parseAddress('localhost:7233')).toEqual({ host: 'localhost', port: 7233 });
  });

  it('parses ip:port', () => {
    expect(parseAddress('192.168.1.1:7233')).toEqual({ host: '192.168.1.1', port: 7233 });
  });

  it('defaults port to 7233 for invalid port', () => {
    expect(parseAddress('localhost:abc')).toEqual({ host: 'localhost', port: 7233 });
  });

  it('handles IPv6-style with port', () => {
    expect(parseAddress('::1:7233')).toEqual({ host: '::1', port: 7233 });
  });
});

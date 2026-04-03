import { describe, it, expect } from 'vitest';
import {
  defineConfig,
  resolveGatewayPort,
  resolveStudioPort,
  resolveTemporalConfig,
  type DurionConfig,
} from '../src/config';

describe('defineConfig', () => {
  it('returns the config object unchanged', () => {
    const cfg: DurionConfig = {
      workflowsPath: './src/workflows.ts',
      workerPath: './src/worker.ts',
    };
    expect(defineConfig(cfg)).toBe(cfg);
  });
});

describe('resolveGatewayPort', () => {
  it('returns default port 3000 when gateway is undefined', () => {
    expect(resolveGatewayPort({ workflowsPath: '', workerPath: '' })).toBe(3000);
  });

  it('returns custom port', () => {
    expect(resolveGatewayPort({ workflowsPath: '', workerPath: '', gateway: { port: 4000 } })).toBe(4000);
  });

  it('returns null when gateway is false', () => {
    expect(resolveGatewayPort({ workflowsPath: '', workerPath: '', gateway: false })).toBeNull();
  });
});

describe('resolveStudioPort', () => {
  it('returns default port 4173 when studio is undefined', () => {
    expect(resolveStudioPort({ workflowsPath: '', workerPath: '' })).toBe(4173);
  });

  it('returns custom port', () => {
    expect(resolveStudioPort({ workflowsPath: '', workerPath: '', studio: { port: 5000 } })).toBe(5000);
  });

  it('returns null when studio is false', () => {
    expect(resolveStudioPort({ workflowsPath: '', workerPath: '', studio: false })).toBeNull();
  });
});

describe('resolveTemporalConfig', () => {
  it('returns defaults when temporal is undefined', () => {
    const result = resolveTemporalConfig({ workflowsPath: '', workerPath: '' });
    expect(result).toEqual({
      devServer: true,
      address: 'localhost:7233',
      namespace: 'default',
      uiPort: 8233,
    });
  });

  it('returns overrides', () => {
    const result = resolveTemporalConfig({
      workflowsPath: '',
      workerPath: '',
      temporal: { devServer: false, address: 'remote:7233', namespace: 'prod', uiPort: 9000 },
    });
    expect(result).toEqual({
      devServer: false,
      address: 'remote:7233',
      namespace: 'prod',
      uiPort: 9000,
    });
  });

  it('returns devServer: false when temporal is false', () => {
    const result = resolveTemporalConfig({ workflowsPath: '', workerPath: '', temporal: false });
    expect(result.devServer).toBe(false);
  });
});

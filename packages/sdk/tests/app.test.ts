import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/sdk/app';
import { clearActiveRuntime } from '../src/sdk/runtime';

describe('createApp', () => {
  beforeEach(() => clearActiveRuntime());
  afterEach(() => clearActiveRuntime());

  it('creates runtime with workflowsPath and resolved taskQueue', async () => {
    const app = await createApp({
      workflowsPath: '/fake/workflows.ts',
      models: {},
    });
    expect(app.workflowsPath).toBe('/fake/workflows.ts');
    expect(app.taskQueue).toBeTruthy();
    expect(app.runtime.models.size).toBe(0);
  });

  it('throws ConfigurationError when workflowsPath is empty', async () => {
    await expect(
      createApp({ workflowsPath: '  ', models: {} }),
    ).rejects.toThrow(/workflowsPath/);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { testAgent } from './test-workflows';

describe('agent-workflow integration', () => {
  let testEnv: Awaited<ReturnType<typeof TestWorkflowEnvironment.createLocal>>;
  const taskQueue = 'test-agent-queue';

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  }, 60_000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it('agent with no tool calls completes in one step', async () => {
    const workflowsPath = path.join(__dirname, 'test-workflows.ts');
    const mockRunModel = async () => ({
      content: 'Final answer',
      toolCalls: [],
      usage: {
        promptTokens: 5,
        completionTokens: 10,
        totalTokens: 15,
        costUsd: 0.001,
      },
    });
    const mockRunTool = async () => ({ result: null });
    const mockRunLifecycleHooks = async () => {};

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.options.namespace ?? 'default',
      taskQueue,
      workflowsPath,
      activities: {
        runModel: mockRunModel,
        runTool: mockRunTool,
        runLifecycleHooks: mockRunLifecycleHooks,
      },
    });

    const runPromise = worker.run();

    const handle = await testEnv.client.workflow.start(testAgent, {
      taskQueue,
      workflowId: `agent-${Date.now()}`,
      args: [{ message: 'Hello' }],
    });

    const result = await handle.result();
    expect(result.reply).toBe('Final answer');
    expect(result.finishReason).toBe('complete');
    expect(result.steps).toBe(1);
    expect(result.usage.totalTokens).toBe(15);
    expect(result.usage.costUsd).toBe(0.001);

    worker.shutdown();
    await runPromise;
  }, 45_000);
});

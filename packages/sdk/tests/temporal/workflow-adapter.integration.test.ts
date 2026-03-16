import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { testWorkflow } from './test-workflows';

describe('workflow-adapter integration', () => {
  let testEnv: Awaited<ReturnType<typeof TestWorkflowEnvironment.createLocal>>;
  const taskQueue = 'test-workflow-queue';

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  }, 60_000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it('runs workflow with mocked runModel and returns result', async () => {
    const workflowsPath = path.join(__dirname, 'test-workflows.ts');
    const mockRunModel = async () => ({
      content: 'mocked reply',
      toolCalls: [],
      usage: {
        promptTokens: 10,
        completionTokens: 5,
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

    const handle = await testEnv.client.workflow.start(testWorkflow, {
      taskQueue,
      workflowId: `wf-${Date.now()}`,
      args: [{ prompt: 'Hi' }],
    });

    const result = await handle.result();
    expect(result).toEqual({
      reply: 'mocked reply',
      cost: 0.001,
    });

    worker.shutdown();
    await runPromise;
  }, 45_000);
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import {
  parentWorkflow,
  parentWithAgent,
  delegatingAgent,
} from './test-workflows';

const mockUsage = {
  promptTokens: 5,
  completionTokens: 10,
  totalTokens: 15,
  costUsd: 0.001,
};

describe('composability integration', () => {
  let testEnv: Awaited<ReturnType<typeof TestWorkflowEnvironment.createLocal>>;
  const taskQueue = 'test-composability-queue';

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  }, 60_000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it('ctx.run() calls a child workflow and returns its result', async () => {
    const workflowsPath = path.join(__dirname, 'test-workflows.ts');
    const mockRunModel = async () => ({
      content: 'child reply text',
      toolCalls: [],
      usage: mockUsage,
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

    const handle = await testEnv.client.workflow.start(parentWorkflow, {
      taskQueue,
      workflowId: `parent-wf-${Date.now()}`,
      args: [{ prompt: 'test input' }],
    });

    const result = await handle.result();
    expect(result.fromChild).toBe('child reply text');

    worker.shutdown();
    await runPromise;
  }, 45_000);

  it('ctx.run() calls a child agent and returns its reply', async () => {
    const workflowsPath = path.join(__dirname, 'test-workflows.ts');
    const mockRunModel = async () => ({
      content: 'agent said this',
      toolCalls: [],
      usage: mockUsage,
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

    const handle = await testEnv.client.workflow.start(parentWithAgent, {
      taskQueue,
      workflowId: `parent-agent-${Date.now()}`,
      args: [{ prompt: 'ask agent' }],
    });

    const result = await handle.result();
    expect(result.agentReply).toBe('agent said this');

    worker.shutdown();
    await runPromise;
  }, 45_000);

  it('agent delegate calls a child workflow when model requests it', async () => {
    const workflowsPath = path.join(__dirname, 'test-workflows.ts');
    let callCount = 0;
    const mockRunModel = async (params: any) => {
      callCount++;
      if (callCount === 1) {
        return {
          content: '',
          toolCalls: [
            { id: 'tc-1', name: 'research', arguments: { message: 'dig into AI' } },
          ],
          usage: mockUsage,
        };
      }
      return {
        content: 'Final orchestrated answer',
        toolCalls: [],
        usage: mockUsage,
      };
    };
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

    const handle = await testEnv.client.workflow.start(delegatingAgent, {
      taskQueue,
      workflowId: `delegate-${Date.now()}`,
      args: [{ message: 'Research AI trends' }],
    });

    const result = await handle.result();
    expect(result.reply).toBe('Final orchestrated answer');
    expect(result.steps).toBe(2);

    worker.shutdown();
    await runPromise;
  }, 45_000);
});

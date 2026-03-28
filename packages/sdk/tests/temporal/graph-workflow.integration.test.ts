import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import {
  sequentialGraph,
  parallelGraph,
  conditionalGraph,
  cyclicGraph,
  infiniteGraph,
  errorGraph,
  budgetGraph,
} from './test-graph-workflows';
import type { ModelResult, ToolResult } from '../../src/sdk/types';

describe('Graph Workflow Integration', () => {
  let testEnv: Awaited<ReturnType<typeof TestWorkflowEnvironment.createLocal>>;
  const taskQueue = 'test-graph-queue';

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  }, 60_000);

  afterAll(async () => {
    await testEnv?.teardown();
  });

  let taskQueueCounter = 0;

  const createTestWorker = async (
    mockRunModel?: (id: string, params: any) => Promise<ModelResult>,
    mockRunTool?: (name: string, input: any) => Promise<ToolResult<any>>
  ) => {
    const workflowsPath = path.join(__dirname, 'test-graph-workflows.ts');
    const taskQueue = `test-graph-queue-${++taskQueueCounter}`;

    const defaultRunModel = async (params: any): Promise<any> => ({
      content: typeof params.messages?.[0]?.content === 'string' 
        ? `${params.messages[0].content} - handled by mock-model` 
        : 'mocked',
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, costUsd: 0.001 },
    });

    const defaultRunTool = async (): Promise<ToolResult<any>> => ({ result: {} });
    const mockRunLifecycleHooks = async () => {};

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: 'default',
      taskQueue,
      workflowsPath,
      activities: {
        runModel: mockRunModel ?? defaultRunModel,
        runTool: mockRunTool ?? defaultRunTool,
        runLifecycleHooks: mockRunLifecycleHooks,
      },
    });

    const runPromise = worker.run();
    return { worker, runPromise, taskQueue };
  };

  it('runs a sequential graph mapping through nodes', async () => {
    const { worker, runPromise, taskQueue } = await createTestWorker();

    const handle = await testEnv.client.workflow.start(sequentialGraph, {
      taskQueue,
      workflowId: `wf-seq-${Date.now()}`,
      args: [{ topic: 'A valid sequence' }],
    });

    const result = await handle.result();
    expect(result.status).toBe('completed');
    expect(result.executedNodes).toEqual(['start', 'end']);
    expect(result.output.result).toBe('A valid sequence - handled by mock-model - ended');
    expect(result.totalUsage.costUsd).toBe(0.001);

    worker.shutdown();
    await runPromise;
  }, 45_000);

  it('runs a conditional graph and routes appropriately', async () => {
    const { worker, runPromise, taskQueue } = await createTestWorker();

    const handleB = await testEnv.client.workflow.start(conditionalGraph, {
      taskQueue,
      workflowId: `wf-cond-${Date.now()}`,
      args: [{ topic: 'B' }],
    });

    const resultB = await handleB.result();
    expect(resultB.executedNodes).toEqual(['decide', 'pathB']);
    expect(resultB.output.result).toBe('Went path B');

    worker.shutdown();
    await runPromise;
  }, 45_000);

  it('executes branches in parallel and applies reducers', async () => {
    const { worker, runPromise, taskQueue } = await createTestWorker();

    const handle = await testEnv.client.workflow.start(parallelGraph, {
      taskQueue,
      workflowId: `wf-par-${Date.now()}`,
      args: [{ topic: 'parallelise me' }],
    });

    const result = await handle.result();
    expect(result.status).toBe('completed');
    // Order from entry -> splits -> joins should be stable via Promise.all matching the edge declarations
    // the declarations were: branchA -> branchB -> branchC
    expect(result.executedNodes.slice(0, 1)).toEqual(['split']);
    expect(result.executedNodes.slice(1, 4).sort()).toEqual(['branchA', 'branchB', 'branchC']);
    expect(result.executedNodes[4]).toEqual('join');

    // Verification of reducers
    expect(result.output.items.sort()).toEqual(['A', 'B', 'C']);
    expect(result.output.merged).toEqual({ b: 'valB', c: 'valC' });

    worker.shutdown();
    await runPromise;
  }, 45_000);

  it('supports cycles and terminates naturally based on conditions', async () => {
    const { worker, runPromise, taskQueue } = await createTestWorker();

    const handle = await testEnv.client.workflow.start(cyclicGraph, {
      taskQueue,
      workflowId: `wf-cyc-${Date.now()}`,
      args: [{ topic: 'cycle' }],
    });

    const result = await handle.result();
    expect(result.status).toBe('completed');
    // Starts with ping(1). conditional to pong. conditional check says ping. repeat loop until 3
    // executed count should be 6: ping, pong, ping, pong, ping, pong.
    expect(result.executedNodes).toHaveLength(6);
    expect(result.output.counter).toBe(3);
    
    worker.shutdown();
    await runPromise;
  }, 60_000);

  it('terminates forcefully when hitting maxIterations against a purely circular graph', async () => {
    const { worker, runPromise, taskQueue } = await createTestWorker();

    const handle = await testEnv.client.workflow.start(infiniteGraph, {
      taskQueue,
      workflowId: `wf-inf-${Date.now()}`,
      args: [{ topic: 'inf' }],
    });

    const result = await handle.result();
    expect(result.status).toBe('max_iterations');
    expect(result.output.counter).toBe(5);
    expect(result.executedNodes).toHaveLength(5);

    worker.shutdown();
    await runPromise;
  }, 45_000);

  it('navigates error routing smoothly', async () => {
    const { worker, runPromise, taskQueue } = await createTestWorker();

    const handle = await testEnv.client.workflow.start(errorGraph, {
      taskQueue,
      workflowId: `wf-err-${Date.now()}`,
      args: [{ topic: 'error-time' }],
    });

    const result = await handle.result();
    expect(result.status).toBe('completed'); // The graph completed because it fell back gracefully
    expect(result.executedNodes).toEqual(['fail', 'fallback']);
    expect(result.output.error).toContain('Caught error from fail: Simulated failure');

    worker.shutdown();
    await runPromise;
  }, 45_000);

  it('early stops with budget_exceeded on consecutive runs exceeding the guard', async () => {
    // Budget graph is configured with maxCostUsd: 0.1
    const { worker, runPromise, taskQueue } = await createTestWorker(async () => ({
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0.15 },
      result: 'Expensive',
    }));

    const handle = await testEnv.client.workflow.start(budgetGraph, {
      taskQueue,
      workflowId: `wf-budg-${Date.now()}`,
      args: [{ topic: 'budget' }],
    });

    const result = await handle.result();
    expect(result.status).toBe('budget_exceeded');
    // Because the budget check is pre-flight, step1 will run, and the budget is checked *before* dispatching step2.
    // So step2 never runs.
    expect(result.executedNodes).toEqual(['step1']);
    expect(result.output.counter).toBe(1);

    worker.shutdown();
    await runPromise;
  }, 45_000);
});

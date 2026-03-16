/**
 * Workflow bundle entry for integration tests.
 * Exports a workflow and an agent for integration tests.
 */
import { workflow, agent } from '../../src/sdk/workflow';

export const testWorkflow = workflow(
  'testWorkflow',
  async (ctx) => {
    const r = await ctx.model('fast', { prompt: ctx.input.prompt });
    return { reply: r.result, cost: ctx.run.accumulatedCost };
  },
);

export const testAgent = agent('testAgent', {
  model: 'fast',
  instructions: 'You are a test agent.',
  tools: [],
  maxSteps: 3,
});

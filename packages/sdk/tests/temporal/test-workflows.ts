/**
 * Workflow bundle entry for integration tests.
 * Exports workflows and agents for integration tests.
 */
import { workflow, agent } from '../../src/sdk/workflow';

export const testWorkflow = workflow(
  'testWorkflow',
  async (ctx) => {
    const r = await ctx.model('fast', { prompt: ctx.input.prompt });
    return { reply: r.result, cost: ctx.metadata.accumulatedCost };
  },
);

export const testAgent = agent('testAgent', {
  model: 'fast',
  instructions: 'You are a test agent.',
  tools: [],
  maxSteps: 3,
});

// --- Composability test workflows ---

export const childWorkflow = workflow(
  'childWorkflow',
  async (ctx) => {
    const r = await ctx.model('fast', { prompt: `Child got: ${ctx.input.message}` });
    return { childReply: r.result };
  },
);

export const parentWorkflow = workflow(
  'parentWorkflow',
  async (ctx) => {
    const childResult = await ctx.run(childWorkflow, { message: ctx.input.prompt });
    return { fromChild: childResult.childReply };
  },
);

export const childAgent = agent('childAgent', {
  model: 'fast',
  instructions: 'You are a child agent used by a parent workflow.',
  tools: [],
  maxSteps: 2,
});

export const parentWithAgent = workflow(
  'parentWithAgent',
  async (ctx) => {
    const agentResult = await ctx.run(childAgent, { message: ctx.input.prompt });
    return { agentReply: (agentResult as any).reply };
  },
);

export const delegatingAgent = agent('delegatingAgent', {
  model: 'fast',
  instructions: 'You are an orchestrator. Use the research delegate when asked.',
  tools: [],
  maxSteps: 3,
  delegates: [
    { name: 'research', description: 'Deep-dive research on a topic', fn: childAgent },
  ],
});

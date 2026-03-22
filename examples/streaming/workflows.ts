/**
 * Streaming example workflow definitions.
 * Provides:
 * - `streamingAgent`: step-level progressive state via `streamState` query polling
 * - `streamingWorkflow`: token streaming via StreamBus (ctx.model({ stream: true }))
 */
import { agent, workflow, type WorkflowContext } from '@durion/sdk/workflow';

export const streamingAgent = agent('streaming-agent', {
  model: 'fast',
  instructions:
    'You are a researcher. Use the slow_search tool multiple times to gather ' +
    'deep context before returning your final summary to the user.',
  tools: ['slow_search'],
  maxSteps: 5,
});

export const streamingWorkflow = workflow(
  'streamingWorkflow',
  async (ctx: WorkflowContext<{ message: string }>) => {
    const r = await ctx.model('fast', {
      prompt: ctx.input.message,
      stream: true,
    });
    return { reply: r.result };
  },
);

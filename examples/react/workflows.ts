/**
 * ReAct example: Thought → Action → Observation loop.
 * Single agent with tools (calculator, search stub); model decides when to use tools.
 */
import { agent } from '@ai-runtime/sdk/workflow';

export const reactAgent = agent('reactAgent', {
  model: 'fast',
  instructions:
    'You are a helpful assistant. Use the calculator for math and the search tool for factual lookups. ' +
    'Reason step by step (thought), use a tool if needed (action), then summarize (observation).',
  tools: ['calculator', 'search'],
  maxSteps: 8,
});

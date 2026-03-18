/**
 * Streaming example workflow definitions.
 * Provides a simple agent that takes multiple slow steps so the client can stream real-time state.
 */
import { agent } from '@ai-runtime/sdk/workflow';

export const streamingAgent = agent('streaming-agent', {
  model: 'fast',
  instructions:
    'You are a researcher. Use the slow_search tool multiple times to gather ' +
    'deep context before returning your final summary to the user.',
  tools: ['slow_search'],
  maxSteps: 5,
});

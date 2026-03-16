/**
 * Memory-Augmented example: short-term (messages) + long-term (stub).
 * agent() with tools remember_fact and recall (in-memory stub); model uses them.
 */
import { agent } from '@ai-runtime/sdk/workflow';

export const memoryAgent = agent('memoryAgent', {
  model: 'fast',
  instructions:
    'You are a helpful assistant with a memory. Use remember_fact to store important facts the user tells you. ' +
    'Use recall to search your memory when answering. Always use recall when the user asks about something they might have told you before.',
  tools: ['remember_fact', 'recall'],
  maxSteps: 10,
});

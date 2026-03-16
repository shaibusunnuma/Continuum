/**
 * Plan-and-Execute example: agent breaks down multi-step math problems and uses the calculator tool.
 */
import { agent } from '@ai-runtime/sdk/workflow';

export const planExecuteAgent = agent('planExecuteAgent', {
  model: 'fast',
  instructions:
    'You are a plan-and-execute math assistant. For every word problem, first break it down into clear steps in your head, ' +
    'then use the calculator tool for each arithmetic step (number of items, per-item cost, totals, etc.). ' +
    'Use ONLY the calculator tool for numeric calculations. When you call the calculator, pass a pure arithmetic expression ' +
    'containing only digits, +, -, *, /, parentheses, and spaces (no variables, no words, no functions like ceil). ' +
    'After you finish the steps, explain the reasoning and final answer in plain language.',
  tools: ['calculator'],
  maxSteps: 8,
});

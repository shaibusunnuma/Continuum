/**
 * Graph/DAG example: explicit DAG of nodes and edges.
 * Sequential + conditional steps: validate → route → model or tool → respond.
 */
import { workflow, type WorkflowContext } from '@ai-runtime/sdk/workflow';

type DagInput = { action: 'greet' | 'compute'; name?: string; expression?: string };

export const dagWorkflow = workflow(
  'dagWorkflow',
  async (ctx: WorkflowContext<DagInput>) => {
    // Node 1: validate
    if (!ctx.input.action) {
      return { error: 'Missing action', branch: 'validate' };
    }
    const action = ctx.input.action;

    // Node 2: route
    if (action === 'greet') {
      const name = ctx.input.name ?? 'there';
      const response = await ctx.model('fast', {
        prompt: `Generate a short, friendly greeting for someone named ${name}. One sentence only.`,
      });
      return {
        branch: 'greet',
        reply: response.result.trim(),
        cost: ctx.run.accumulatedCost,
      };
    }

    if (action === 'compute') {
      const expr = ctx.input.expression ?? '0';
      const toolResult = await ctx.tool<{ result: number }>('calculator', {
        expression: expr,
      });
      const response = await ctx.model('fast', {
        prompt: `The user asked to compute: ${expr}. Result is ${toolResult.result}. Reply in one short sentence.`,
      });
      return {
        branch: 'compute',
        result: toolResult.result,
        reply: response.result.trim(),
        cost: ctx.run.accumulatedCost,
      };
    }

    return { error: 'Unknown action', branch: 'route', cost: ctx.run.accumulatedCost };
  },
);

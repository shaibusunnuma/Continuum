/**
 * Example workflow definitions.
 *
 * This file is loaded by Temporal's workflow bundler (via workflowsPath).
 * It can ONLY import from @temporalio/workflow and workflow-safe SDK modules.
 * Import workflow and agent from the SDK barrel (public API).
 */
import { workflow, agent, type WorkflowContext } from '@durion/sdk/workflow';

// ---------------------------------------------------------------------------
// Example 1: Customer support workflow (explicit control flow)
// ---------------------------------------------------------------------------

type CustomerSupportInput = { message: string; orderId?: string };

export const customerSupport = workflow(
  'customerSupport',
  async (ctx: WorkflowContext<CustomerSupportInput>) => {
    const classification = await ctx.model('fast', {
      prompt: `Classify this customer message into one of: refund, tracking, general.\n\nMessage: "${ctx.input.message}"\n\nRespond with just the category.`,
    });

    ctx.log('intent-classified', { intent: classification.result });
    const intent = classification.result.trim().toLowerCase();

    if (intent.includes('refund') && ctx.input.orderId) {
      const order = await ctx.tool<{ status: string; total: number }>(
        'fetch_order',
        { orderId: ctx.input.orderId },
      );

      const response = await ctx.model('reasoning', {
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful customer support agent. Be empathetic and concise.',
          },
          {
            role: 'user',
            content: `The customer wants a refund. Order details: ${JSON.stringify(order.result)}. Draft a response.`,
          },
        ],
      });

      return {
        reply: response.result,
        intent,
        cost: ctx.metadata.accumulatedCost,
      };
    }

    if (intent.includes('tracking') && ctx.input.orderId) {
      const order = await ctx.tool<{ status: string; total: number }>(
        'fetch_order',
        { orderId: ctx.input.orderId },
      );

      return {
        reply: `Your order ${ctx.input.orderId} status is: ${order.result.status}`,
        intent,
        cost: ctx.metadata.accumulatedCost,
      };
    }

    const general = await ctx.model('fast', {
      messages: [
        {
          role: 'system',
          content: 'You are a helpful customer support agent. Be concise.',
        },
        { role: 'user', content: ctx.input.message },
      ],
    });

    return {
      reply: general.result,
      intent,
      cost: ctx.metadata.accumulatedCost,
    };
  },
);

// ---------------------------------------------------------------------------
// Example 2: Durable travel agent (autonomous agent loop)
// ---------------------------------------------------------------------------

export const travelAgent = agent('travelAgent', {
  model: 'fast',
  instructions:
    'You are a travel booking assistant. Help users find flights and hotels. ' +
    'Use the available tools to search for options and book them. ' +
    'Always confirm with the user before booking.',
  tools: ['search_flights', 'search_hotels'],
  maxSteps: 8,
  budgetLimit: { maxCostUsd: 0.25 },
});

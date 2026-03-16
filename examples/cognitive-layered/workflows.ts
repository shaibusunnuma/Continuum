/**
 * Cognitive / Layered example: reactive (fast) vs deliberative (slow).
 * workflow(): classify with fast model → if "simple" return fast response, else reasoning model.
 */
import { workflow, type WorkflowContext } from '@ai-runtime/sdk/workflow';

type CognitiveInput = { query: string };

export const cognitiveWorkflow = workflow(
  'cognitiveWorkflow',
  async (ctx: WorkflowContext<CognitiveInput>) => {
    const q = ctx.input.query;
    const lower = q.toLowerCase();

    const classification = await ctx.model('fast', {
      prompt:
        `Classify this user query as "simple" or "complex". Simple = greeting, yes/no, one-word answer, or \"what time is it\" style questions. ` +
        `Complex = reasoning, comparison, multi-step.\n\nQuery: "${q}"\n\nReply with only: simple or complex`,
    });
    const tier = classification.result.trim().toLowerCase();

    const asksForTime =
      lower.includes('time') || lower.includes('date') || lower.includes('clock');

    if (tier.includes('simple')) {
      if (asksForTime) {
        const now = await ctx.tool<{ iso: string; human: string }>('get_time', {});
        return {
          query: q,
          layer: 'reactive',
          reply: `The current date and time is ${now.result.human} (ISO: ${now.result.iso}).`,
          cost: ctx.run.accumulatedCost,
        };
      }

      const fastReply = await ctx.model('fast', {
        prompt: `Give a very short, direct answer (1 sentence): ${q}`,
      });
      return {
        query: q,
        layer: 'reactive',
        reply: fastReply.result.trim(),
        cost: ctx.run.accumulatedCost,
      };
    }

    const reasoningReply = await ctx.model('reasoning', {
      prompt: `Answer with clear reasoning (2-4 sentences). Consider pros/cons if relevant:\n\n${q}`,
    });
    return {
      query: q,
      layer: 'deliberative',
      reply: reasoningReply.result.trim(),
      cost: ctx.run.accumulatedCost,
    };
  },
);

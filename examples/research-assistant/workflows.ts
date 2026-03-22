/**
 * Research assistant example — content brief workflow + research agent (Gemini).
 * Workflow-safe: only import from @temporalio/workflow and @durion/sdk/workflow.
 */
import { workflow, agent, type WorkflowContext } from '@durion/sdk/workflow';

type ContentBriefInput = { topic: string; audience?: string };

export const contentBrief = workflow(
  'contentBrief',
  async (ctx: WorkflowContext<ContentBriefInput>) => {
    const audience = ctx.input.audience ?? 'general reader';

    const outline = await ctx.model('fast', {
      prompt: `Create a short content outline for an article on: "${ctx.input.topic}". Audience: ${audience}. ` +
        `Respond with 3-5 bullet points (headlines or key ideas only, one per line).`,
    });

    const tone = await ctx.model('fast', {
      messages: [
        {
          role: 'system',
          content: 'You are an editor. Reply with exactly one word: the recommended tone (e.g. professional, casual, technical).',
        },
        {
          role: 'user',
          content: `Topic: ${ctx.input.topic}. Audience: ${audience}. Suggest tone.`,
        },
      ],
    });

    ctx.log('brief-created', { topic: ctx.input.topic });

    return {
      topic: ctx.input.topic,
      audience,
      outline: outline.result.trim().split('\n').filter(Boolean),
      suggestedTone: tone.result.trim(),
      cost: ctx.metadata.accumulatedCost,
    };
  },
);

export const researchAssistant = agent('research-assistant', {
  model: 'reasoning',
  instructions:
    'You are a research assistant. Answer the user\'s question by using the search tool to find relevant information, then summarize your findings clearly. ' +
    'Use search_web when you need up-to-date or factual information. Keep answers concise and cite what you found.',
  tools: ['search_web', 'save_note'],
  maxSteps: 6,
  budgetLimit: { maxCostUsd: 0.15 },
});

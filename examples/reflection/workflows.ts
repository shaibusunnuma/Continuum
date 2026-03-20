/**
 * Reflection / Self-Critique example: Generate → Critic → Improve.
 * workflow(): draft → critic (with draft) → revision.
 */
import { workflow, type WorkflowContext } from '@ai-runtime/sdk/workflow';

type ReflectionInput = { topic: string };

export const reflectionWorkflow = workflow(
  'reflectionWorkflow',
  async (ctx: WorkflowContext<ReflectionInput>) => {
    // Step 1: draft
    const draft = await ctx.model('fast', {
      prompt: `Write a short paragraph (2-4 sentences) about: "${ctx.input.topic}". Keep it concise.`,
    });
    const draftText = draft.result.trim();

    // Step 2: critic
    const critic = await ctx.model('fast', {
      messages: [
        {
          role: 'system',
          content: 'You are an editor. List 1-3 specific improvements (clarity, brevity, structure). One short paragraph.',
        },
        { role: 'user', content: `Draft:\n\n${draftText}\n\nWhat should be improved?` },
      ],
    });
    const feedback = critic.result.trim();

    // Step 3: revision
    const revision = await ctx.model('fast', {
      messages: [
        {
          role: 'system',
          content: 'Rewrite the draft incorporating the feedback. Output only the revised paragraph, nothing else.',
        },
        { role: 'user', content: `Draft:\n${draftText}\n\nFeedback:\n${feedback}\n\nRevised paragraph:` },
      ],
    });

    return {
      topic: ctx.input.topic,
      draft: draftText,
      feedback,
      revision: revision.result.trim(),
      cost: ctx.metadata.accumulatedCost,
    };
  },
);

/**
 * HITL example workflow.
 * Generates an email draft, then pauses and WAITS for the user to approve or reject.
 */
import { workflow, type WorkflowContext } from '@ai-runtime/sdk/workflow';

type DraftInput = { topic: string };

export const draftEmail = workflow(
  'draftEmail',
  async (ctx: WorkflowContext<DraftInput>) => {
    let approved = false;
    let feedback = '';
    let currentDraft = '';

    while (!approved) {
      let prompt = `Draft a short, professional email about: ${ctx.input.topic}`;
      if (feedback) {
        prompt += `\n\nThe user rejected the previous draft and said: "${feedback}". Please revise it.`;
      }

      ctx.log('generating-draft', { prompt });
      const draft = await ctx.model('fast', { prompt });
      currentDraft = draft.result;
      
      ctx.log('draft-ready', { draft: currentDraft });

      // WAIT FOR USER INPUT
      // The worker pauses here indefinitely without taking process memory,
      // waiting for a 'userInput' signal from the client/UI.
      const userInput = await ctx.waitForInput<{ action: 'approve' | 'reject'; feedback?: string }>(
        'Please approve or reject the draft.'
      );

      ctx.log('user-responded', { action: userInput.action });

      if (userInput.action === 'approve') {
        approved = true;
      } else {
        feedback = userInput.feedback ?? 'No feedback provided.';
      }
    }

    return {
      finalEmail: currentDraft,
      cost: ctx.run.accumulatedCost,
    };
  },
);

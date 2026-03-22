/**
 * Composability example: ctx.run() (child workflows/agents) and agent delegates.
 * Loaded by Temporal via workflowsPath — only @ai-runtime/sdk/workflow imports.
 */
import { workflow, agent, type WorkflowContext } from '@ai-runtime/sdk/workflow';

// ---------------------------------------------------------------------------
// 1) ctx.run — parent workflow calls a child workflow as a Temporal child
// ---------------------------------------------------------------------------

type ChildInput = { text: string };
type ChildOutput = { processed: string };

/** Child: deterministic transform (no LLM) to show pure composition. */
export const composabilityChild = workflow(
  'composabilityChild',
  async (ctx: WorkflowContext<ChildInput>): Promise<ChildOutput> => {
    return { processed: ctx.input.text.trim().toUpperCase() };
  },
);

type ParentInput = { message: string };

/** Parent: runs child via ctx.run(), then one model call for a short summary. */
export const composabilityParent = workflow(
  'composabilityParent',
  async (ctx: WorkflowContext<ParentInput>) => {
    const childOut = await ctx.run(composabilityChild, { text: ctx.input.message });
    const r = await ctx.model('fast', {
      prompt: `In one short sentence, greet the user and mention this transformed text: "${childOut.processed}"`,
      costCalculator: 'my-custom-cost',
    });
    return {
      child: childOut,
      summary: r.result,
      cost: ctx.metadata.accumulatedCost,
    };
  },
);

// ---------------------------------------------------------------------------
// 2) delegates — orchestrator agent hands off to a specialist agent (child wf)
// ---------------------------------------------------------------------------

export const composabilitySpecialist = agent('composabilitySpecialist', {
  model: 'fast',
  costCalculator: 'my-custom-cost',
  instructions:
    'You are a specialist. Answer the user in one or two concise sentences. No tools.',
  tools: [],
  maxSteps: 4,
});

export const composabilityOrchestrator = agent('composabilityOrchestrator', {
  model: 'fast',
  costCalculator: 'my-custom-cost',
  instructions:
    'You are a coordinator. If the user asks for expert or specialist help, call the specialist tool once with { "message": "<task>" }. ' +
    'Otherwise answer briefly yourself in one sentence.',
  tools: [],
  maxSteps: 6,
  delegates: [
    {
      name: 'specialist',
      description:
        'Delegate to the specialist agent for a deeper or expert-style answer. Pass { message: string } with the question.',
      fn: composabilitySpecialist,
    },
  ],
});

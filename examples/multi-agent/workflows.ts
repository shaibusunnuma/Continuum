/**
 * Multi-Agent example: Pattern A (multi-role in one workflow) + Pattern B (three agents).
 * Pattern A: single workflow with 3+ ctx.model() steps (Researcher, Coder, Analyst).
 * Pattern B: three agents exported for use by orchestrator script.
 */
import { workflow, agent, type WorkflowContext } from '@ai-runtime/sdk/workflow';

type MultiAgentInput = { query: string };

// ---------------------------------------------------------------------------
// Pattern A: Multi-role in one workflow
// ---------------------------------------------------------------------------

export const multiAgentWorkflow = workflow(
  'multiAgentWorkflow',
  async (ctx: WorkflowContext<MultiAgentInput>) => {
    const query = ctx.input.query;

    const researcher = await ctx.model('fast', {
      messages: [
        { role: 'system', content: 'You are a Researcher. Summarize the topic in 1-2 sentences.' },
        { role: 'user', content: query },
      ],
    });
    const researchSummary = researcher.result.trim();

    const coder = await ctx.model('fast', {
      messages: [
        { role: 'system', content: 'You are a Coder. Given a research summary, suggest one concrete next step (e.g. "Propose an API design"). One sentence.' },
        { role: 'user', content: `Research: ${researchSummary}` },
      ],
    });
    const coderSuggestion = coder.result.trim();

    const analyst = await ctx.model('fast', {
      messages: [
        { role: 'system', content: 'You are an Analyst. Given research and coder suggestion, give a final recommendation in one sentence.' },
        { role: 'user', content: `Research: ${researchSummary}\nCoder: ${coderSuggestion}` },
      ],
    });

    return {
      query,
      researchSummary,
      coderSuggestion,
      recommendation: analyst.result.trim(),
      cost: ctx.metadata.accumulatedCost,
    };
  },
);

// ---------------------------------------------------------------------------
// Pattern B: Three agents (orchestrator script chains these via Temporal client)
// ---------------------------------------------------------------------------

export const researchAgent = agent('researchAgent', {
  model: 'fast',
  instructions:
    'You are the Researcher in a 3-agent team (Researcher → Coder → Analyst). ' +
    'Your job is to read the user question and produce a short factual summary (1–3 sentences) capturing the key requirements and constraints. ' +
    'Do NOT propose solutions or next steps; only restate and clarify the problem.',
  tools: [],
  maxSteps: 1,
});

export const coderAgent = agent('coderAgent', {
  model: 'fast',
  instructions:
    'You are the Coder in a 3-agent team (Researcher → Coder → Analyst). ' +
    'You receive the Researcher’s summary as input. In exactly one sentence, suggest ONE concrete, actionable next step ' +
    '(for example, \"Design the API endpoints for...\", \"Implement a prototype that...\", or \"Run a small experiment to...\"). ' +
    'Do not repeat the full summary; focus only on the next action.',
  tools: [],
  maxSteps: 1,
});

export const analystAgent = agent('analystAgent', {
  model: 'fast',
  instructions:
    'You are the Analyst in a 3-agent team (Researcher → Coder → Analyst). ' +
    'Given the previous messages (problem summary and coder’s proposed next step), respond with one sentence giving your overall recommendation ' +
    'on whether to proceed with that step and any key caveat (e.g. \"Proceed, but validate X first\").',
  tools: [],
  maxSteps: 1,
});

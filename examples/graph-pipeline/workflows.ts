/**
 * Graph pipeline example — demonstrates the graph() primitive.
 *
 * Research pipeline: research → evaluate → (refine loop or publish)
 *
 * Loaded by Temporal via workflowsPath — only @durion/sdk/workflow imports.
 */
import { graph } from '@durion/sdk/workflow';
import { z } from 'zod';
// ─── State schema ───────────────────────────────────────────────────────────
const ResearchState = z.object({
    topic: z.string(),
    findings: z.array(z.string()).default([]),
    quality: z.number().default(0),
    iterations: z.number().default(0),
    finalReport: z.string().optional(),
});
// ─── Graph definition ───────────────────────────────────────────────────────
export const researchPipeline = graph('researchPipeline', {
    state: ResearchState,
    nodes: {
        research: async (ctx) => {
            const r = await ctx.model('fast', {
                prompt: `Research this topic in 2-3 sentences: ${ctx.state.topic}`,
            });
            ctx.log('research-complete', { length: r.result.length });
            return { findings: [r.result] };
        },
        evaluate: async (ctx) => {
            const r = await ctx.model('fast', {
                prompt:
                    `You are a quality evaluator. Rate the below research on a scale of 0-100. ` +
                    `Respond ONLY with a JSON object: {"score": <number>}.\n\n` +
                    `Research:\n${ctx.state.findings.join('\n')}`,
                schema: z.toJSONSchema(z.object({ score: z.number() })),
            });
            const score = JSON.parse(r.result).score;
            ctx.log('evaluate-complete', { score });
            return { quality: score, iterations: ctx.state.iterations + 1 };
        },
        refine: async (ctx) => {
            const r = await ctx.model('fast', {
                prompt:
                    `Improve and expand on this research. Keep it to 3-4 sentences.\n\n` +
                    `Current findings:\n${ctx.state.findings.join('\n')}`,
            });
            ctx.log('refine-complete', { iteration: ctx.state.iterations });
            return { findings: [...ctx.state.findings, r.result] };
        },
        publish: async (ctx) => {
            const r = await ctx.model('fast', {
                prompt:
                    `Write a brief final report (3-5 sentences) synthesizing these findings:\n\n` +
                    ctx.state.findings.join('\n'),
            });
            ctx.log('publish-complete');
            return { finalReport: r.result };
        },
    },
    edges: [
        { from: 'research', to: 'evaluate' },
        {
            from: 'evaluate',
            to: (state) => (state.quality >= 70 ? 'publish' : 'refine'),
        },
        { from: 'refine', to: 'evaluate' },
    ],
    entry: 'research',
    maxIterations: 8,
});
/**
 * Graph pipeline example — demonstrates the graph() primitive.
 *
 * Research pipeline: research → evaluate → (refine loop or publish)
 *
 * Loaded by Temporal via workflowsPath — only @durion/sdk/workflow imports.
 */
import { graph, reducers } from '@durion/sdk/workflow';
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

// ─── Parallel analysis (Phase 2 demo) ──────────────────────────────────────

const ParallelAnalysisState = z.object({
    topic: z.string(),
    perspectives: z.array(z.string()).default([]),
    technicalAnalysis: z.string().optional(),
    practicalAnalysis: z.string().optional(),
    synthesis: z.string().optional(),
});

export const parallelAnalysis = graph('parallelAnalysis', {
    state: ParallelAnalysisState,
    nodes: {
        analyzeTechnical: async (ctx) => {
            const r = await ctx.model('fast', {
                prompt:
                    `Analyze the technical aspects of "${ctx.state.topic}". ` +
                    `Cover key mechanisms, recent advances, and open challenges in 3-4 sentences.`,
            });
            ctx.log('technical-analysis-complete');
            return { technicalAnalysis: r.result, perspectives: ['technical'] };
        },
        analyzePractical: async (ctx) => {
            const r = await ctx.model('fast', {
                prompt:
                    `Analyze the practical applications of "${ctx.state.topic}". ` +
                    `Cover real-world use cases, industry adoption, and impact in 3-4 sentences.`,
            });
            ctx.log('practical-analysis-complete');
            return { practicalAnalysis: r.result, perspectives: ['practical'] };
        },
        synthesize: async (ctx) => {
            const r = await ctx.model('fast', {
                prompt:
                    `Synthesize these two analyses into a cohesive summary:\n\n` +
                    `Technical: ${ctx.state.technicalAnalysis}\n\n` +
                    `Practical: ${ctx.state.practicalAnalysis}\n\n` +
                    `Perspectives covered: ${ctx.state.perspectives.join(', ')}`,
            });
            ctx.log('synthesis-complete', { perspectives: ctx.state.perspectives });
            return { synthesis: r.result };
        },
    },
    edges: [
        { from: 'analyzeTechnical', to: 'synthesize' },
        { from: 'analyzePractical', to: 'synthesize' },
    ],
    // Parallel entry: both analysis nodes start concurrently
    entry: ['analyzeTechnical', 'analyzePractical'],
    // Safe parallel merge: concatenate perspectives from both branches
    reducers: { perspectives: reducers.append },
});

// ─── Evaluation loop (Phase 3 demo) ────────────────────────────────────────

const EvalLoopState = z.object({
    topic: z.string(),
    draft: z.string().default(''),
    score: z.number().default(0),
    feedback: z.string().default(''),
    rounds: z.number().default(0),
});

export const evaluationLoop = graph('evaluationLoop', {
    state: EvalLoopState,
    nodes: {
        generate: async (ctx) => {
            const r = await ctx.model('fast', {
                prompt:
                    ctx.state.rounds === 0
                        ? `Write a concise 2-3 sentence explanation of "${ctx.state.topic}".`
                        : `Improve this draft based on feedback:\n\nDraft: ${ctx.state.draft}\nFeedback: ${ctx.state.feedback}`,
            });
            ctx.log('generate-complete', { round: ctx.state.rounds });
            return { draft: r.result };
        },
        evaluate: async (ctx) => {
            const r = await ctx.model('fast', {
                prompt:
                    `Rate this draft 0-100 and give one sentence of improvement feedback.\n\n` +
                    `Draft: ${ctx.state.draft}\n\n` +
                    `Respond ONLY with JSON: {"score": <number>, "feedback": "<string>"}`,
                schema: z.toJSONSchema(z.object({ score: z.number(), feedback: z.string() })),
            });
            const parsed = JSON.parse(r.result);
            ctx.log('evaluate-complete', { score: parsed.score, round: ctx.state.rounds });
            return { score: parsed.score, feedback: parsed.feedback, rounds: ctx.state.rounds + 1 };
        },
    },
    edges: [
        { from: 'generate', to: 'evaluate' },
        {
            from: 'evaluate',
            to: (state) => (state.score < 80 ? [] : ['generate']),
        },
    ],
    entry: 'generate',
    maxIterations: 20,
    // Budget guard: stop if token usage gets too high
    budgetLimit: { maxTokens: 300 },
});
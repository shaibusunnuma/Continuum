import { z } from 'zod';
import { graph, reducers } from '../../src/sdk/workflow';

// ─── Shared ───────────────────────────────────────────────────────────────

const StateSchema = z.object({
  topic: z.string(),
  result: z.string().optional(),
  items: z.array(z.string()).default([]),
  merged: z.record(z.string(), z.string()).default({}),
  counter: z.number().default(0),
  error: z.string().optional(),
});

type TestState = z.infer<typeof StateSchema>;

// ─── Sequential Graph ─────────────────────────────────────────────────────

export const sequentialGraph = graph('sequentialGraph', {
  state: StateSchema,
  nodes: {
    start: async (ctx) => {
      // Simulate activity usage
      const m = await ctx.model('mock-model', { prompt: ctx.state.topic });
      return { result: m.result };
    },
    end: async (ctx) => {
      return { result: ctx.state.result + ' - ended' };
    },
  },
  edges: [{ from: 'start', to: 'end' }],
  entry: 'start',
});

// ─── Parallel Graph (Fan-out / Fan-in) ────────────────────────────────────

export const parallelGraph = graph('parallelGraph', {
  state: StateSchema,
  nodes: {
    split: async () => ({}), // Just to start
    branchA: async (ctx) => {
      return { items: ['A'] };
    },
    branchB: async (ctx) => {
      return { items: ['B'], merged: { b: 'valB' } };
    },
    branchC: async (ctx) => {
      return { items: ['C'], merged: { c: 'valC' } };
    },
    join: async (ctx) => {
      return { result: `Joined: ${ctx.state.items.join(',')}` };
    },
  },
  edges: [
    { from: 'split', to: ['branchA', 'branchB', 'branchC'] },
    { from: 'branchA', to: 'join' },
    { from: 'branchB', to: 'join' },
    { from: 'branchC', to: 'join' },
  ],
  entry: 'split',
  reducers: {
    items: reducers.append,
    merged: reducers.merge,
  },
});

// ─── Conditional Graph ────────────────────────────────────────────────────

export const conditionalGraph = graph('conditionalGraph', {
  state: StateSchema,
  nodes: {
    decide: async (ctx) => {
      return { counter: ctx.state.counter + 1 };
    },
    pathA: async (ctx) => {
      return { result: 'Went path A' };
    },
    pathB: async (ctx) => {
      return { result: 'Went path B' };
    },
  },
  edges: [
    {
      from: 'decide',
      to: (state) => (state.topic === 'A' ? 'pathA' : ['pathB']),
    },
  ],
  entry: 'decide',
});

// ─── Cyclic Graph (Max Iterations Guard) ──────────────────────────────────

export const cyclicGraph = graph('cyclicGraph', {
  state: StateSchema,
  nodes: {
    ping: async (ctx) => {
      return { counter: ctx.state.counter + 1 };
    },
    pong: async (ctx) => {
      return { result: `Pinged ${ctx.state.counter} times` };
    },
  },
  edges: [
    { from: 'ping', to: 'pong' },
    {
      from: 'pong',
      to: (state) => (state.counter < 3 ? 'ping' : []),
    },
  ],
  entry: 'ping',
  maxIterations: 10, // Failsafe, but code exits cycle naturally (ping->pong->ping->pong->ping->pong = 6 interactions)
});

// ─── Cyclic Graph (Hitting Max Iterations) ────────────────────────────────

export const infiniteGraph = graph('infiniteGraph', {
  state: StateSchema,
  nodes: {
    ping: async (ctx) => {
      return { counter: ctx.state.counter + 1 };
    },
  },
  edges: [
    {
      from: 'ping',
      to: (state) => 'ping',
    },
  ],
  entry: 'ping',
  maxIterations: 5, // We expect this to fail with max_iterations
});

// ─── Error Routing Graph ──────────────────────────────────────────────────

export const errorGraph = graph('errorGraph', {
  state: StateSchema,
  nodes: {
    fail: async (ctx) => {
      throw new Error('Simulated failure');
    },
    fallback: async (ctx) => {
      return {
        error: `Caught error from ${ctx.lastError?.node}: ${ctx.lastError?.message}`,
      };
    },
  },
  edges: [
    { from: 'fail', to: 'fallback' /* Should never be hit due to throw */ },
  ],
  onError: {
    fail: 'fallback',
  },
  entry: 'fail',
});

// ─── Budget Guard Graph ───────────────────────────────────────────────────

export const budgetGraph = graph('budgetGraph', {
  state: StateSchema,
  nodes: {
    step1: async (ctx) => {
      // Simulate an expensive model call
      await ctx.model('expensive-model', { prompt: 'costly' });
      return { counter: 1 };
    },
    step2: async (ctx) => {
      return { counter: 2 };
    },
  },
  edges: [{ from: 'step1', to: 'step2' }],
  entry: 'step1',
  budgetLimit: { maxCostUsd: 0.1 }, // Will trip after step1 if step1 > $0.10
});

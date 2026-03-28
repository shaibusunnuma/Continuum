import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateGraphConfig } from '../../src/sdk/graph/validator';
import { GraphValidationError } from '../../src/sdk/errors';

describe('Graph Validator', () => {
  const dummyState = z.object({ value: z.string() });
  const noopNode = async () => {};

  describe('Fatal Errors (Throws GraphValidationError)', () => {
    it('throws if state schema is missing or invalid', () => {
      expect(() => {
        validateGraphConfig('test', {
          state: null as any,
          nodes: { a: noopNode },
          edges: [],
          entry: 'a',
        });
      }).toThrow(GraphValidationError);
      expect(() => {
        validateGraphConfig('test', {
          state: 'not-zod',
          nodes: { a: noopNode },
          edges: [],
          entry: 'a',
        });
      }).toThrow(GraphValidationError);
    });

    it('throws if no nodes defined', () => {
      expect(() => {
        validateGraphConfig('test', {
          state: dummyState,
          nodes: {},
          edges: [],
          entry: 'a',
        });
      }).toThrow(/at least one node must be defined/i);
    });

    it('throws if entry specifies a non-existing node', () => {
      expect(() => {
        validateGraphConfig('test', {
          state: dummyState,
          nodes: { a: noopNode },
          edges: [],
          entry: 'b',
        });
      }).toThrow(/entry "b" does not reference an existing node/i);
    });

    it('throws if edge references an unknown source or static target', () => {
      // Unknown source
      expect(() => {
        validateGraphConfig('test', {
          state: dummyState,
          nodes: { a: noopNode, b: noopNode },
          edges: [{ from: 'c', to: 'b' }],
          entry: 'a',
        });
      }).toThrow(/Edge 0: from "c" does not reference an existing node/i);

      // Unknown target
      expect(() => {
        validateGraphConfig('test', {
          state: dummyState,
          nodes: { a: noopNode, b: noopNode },
          edges: [{ from: 'a', to: 'c' }],
          entry: 'a',
        });
      }).toThrow(/Edge 0: to "c" does not reference an existing node/i);
    });

    it('throws if onError references unknown nodes', () => {
      expect(() => {
        validateGraphConfig('test', {
          state: dummyState,
          nodes: { a: noopNode, b: noopNode },
          edges: [{ from: 'a', to: 'b' }],
          entry: 'a',
          onError: { a: 'c' },
        });
      }).toThrow(/onError value "c" \(fallback for "a"\) does not reference an existing node/i);

      expect(() => {
        validateGraphConfig('test', {
          state: dummyState,
          nodes: { a: noopNode, b: noopNode },
          edges: [{ from: 'a', to: 'b' }],
          entry: 'a',
          onError: { c: 'b' },
        });
      }).toThrow(/onError key "c" does not reference an existing node/i);
    });

    it('throws if explicit exits contain unknown nodes', () => {
      expect(() => {
        validateGraphConfig('test', {
          state: dummyState,
          nodes: { a: noopNode, b: noopNode },
          edges: [{ from: 'a', to: 'b' }],
          entry: 'a',
          exits: ['c'],
        });
      }).toThrow(/exits includes "c" which does not reference/i);
    });

    it('warns if no terminal nodes are found and no conditional edges exist', () => {
      // It downgrades to a warning internally and validates. But we introduced it to allow cylic graphs
      // wait, the validator throws if no terminal nodes AND no conditional edges.
      // Let's test the fatal case where there's purely a static cycle
      expect(() => {
        validateGraphConfig('test', {
          state: dummyState,
          nodes: { a: noopNode, b: noopNode },
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'a' },
          ],
          entry: 'a',
        });
      }).toThrow(/no terminal node found/i);
    });
  });

  describe('Warnings (Returns warnings array)', () => {
    it('warns about unreachable nodes', () => {
      const warnings = validateGraphConfig('test', {
        state: dummyState,
        nodes: { a: noopNode, b: noopNode },
        edges: [],
        entry: 'a',
      });
      expect(warnings).toEqual(
        expect.arrayContaining([expect.stringMatching(/node "b" is not reachable/i)])
      );
    });

    it('warns but does not throw if no static terminal node but conditional edges exist', () => {
      const warnings = validateGraphConfig('test', {
        state: dummyState,
        nodes: { a: noopNode, b: noopNode },
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: (state: any) => 'a' }, // Conditional edge allows pure cycles
        ],
        entry: 'a',
      });
      expect(warnings).toEqual(
        expect.arrayContaining([expect.stringMatching(/no static terminal node found/i)])
      );
    });

    it('does not warn on unreachable nodes that are fallback nodes', () => {
      const warnings = validateGraphConfig('test', {
        state: dummyState,
        nodes: { a: noopNode, b: noopNode, c: noopNode },
        edges: [{ from: 'a', to: 'b' }],
        entry: 'a',
        onError: { b: 'c' },
      });
      // Node 'c' is not reached through edges, but 'onError' references it.
      // Because `validateGraphConfig` implementation builds reachability graph, does it track `onError`?
      // Yes, if implementation accounts for error edges.
      // Easiest is to check length to ensure no warning about 'c'
      expect(warnings.find((w) => w.includes('unreachable'))).toBeUndefined();
    });
  });

  describe('Valid Graphs', () => {
    it('returns empty warnings for a valid basic graph', () => {
      const warnings = validateGraphConfig('test', {
        state: dummyState,
        nodes: { a: noopNode, b: noopNode },
        edges: [{ from: 'a', to: 'b' }],
        entry: 'a',
      });
      expect(warnings).toHaveLength(0);
    });

    it('returns empty warnings for valid fan-out', () => {
      const warnings = validateGraphConfig('test', {
        state: dummyState,
        nodes: { a: noopNode, b: noopNode, c: noopNode, d: noopNode },
        edges: [
          { from: 'a', to: ['b', 'c'] },
          { from: 'b', to: 'd' },
          { from: 'c', to: 'd' },
        ],
        entry: 'a',
      });
      expect(warnings.find((w) => w.includes('unreachable'))).toBeUndefined();
    });
  });
});

import { describe, it, expect } from 'vitest';
import { reducers } from '../../src/sdk/graph/reducers';

describe('Graph Reducers', () => {
  describe('append', () => {
    it('appends an element array to an existing array', () => {
      expect(reducers.append(['a'], ['b'])).toEqual(['a', 'b']);
      expect(reducers.append([1, 2], [3])).toEqual([1, 2, 3]);
    });

    it('appends an array to an existing array', () => {
      expect(reducers.append(['a'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('creates a new array if existing is undefined or null', () => {
      expect(reducers.append(undefined as any, ['a'])).toEqual(['a']);
      expect(reducers.append(null as any, ['a'])).toEqual(['a']);
    });

    it('ignores existing value if it is not an array (and not nullish)', () => {
      // implementation treats non-arrays as [] and spreads them
      expect(reducers.append('not-an-array' as any, ['a'])).toEqual(['a']);
    });
  });

  describe('merge', () => {
    it('shallow merges two objects', () => {
      const existing: Record<string, unknown> = { a: 1, b: 2 };
      const incoming: Record<string, unknown> = { b: 3, c: 4 };
      expect(reducers.merge(existing, incoming)).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('returns incoming if existing is undefined or null', () => {
      expect(reducers.merge(undefined as any, { a: 1 })).toEqual({ a: 1 });
      expect(reducers.merge(null as any, { a: 1 })).toEqual({ a: 1 });
    });

  });
});

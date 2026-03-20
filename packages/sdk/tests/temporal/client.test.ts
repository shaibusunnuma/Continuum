import { describe, it, expect } from 'vitest';
import { resolveWorkflowType } from '../../src/sdk/temporal/client';
import { ConfigurationError } from '../../src/sdk/errors';

describe('resolveWorkflowType', () => {
  it('returns fn.name for a named function', () => {
    function myWorkflow() {}
    expect(resolveWorkflowType(myWorkflow)).toBe('myWorkflow');
  });

  it('returns the name set by Object.defineProperty', () => {
    const fn = function () {};
    Object.defineProperty(fn, 'name', { value: 'customerSupport' });
    expect(resolveWorkflowType(fn)).toBe('customerSupport');
  });

  it('throws ConfigurationError for an anonymous arrow function', () => {
    const fn = (() => {
      const inner = () => {};
      Object.defineProperty(inner, 'name', { value: '' });
      return inner;
    })();
    expect(() => resolveWorkflowType(fn)).toThrow(ConfigurationError);
    expect(() => resolveWorkflowType(fn)).toThrow('Cannot derive workflow type');
  });

  it('throws ConfigurationError for a function with whitespace-only name', () => {
    const fn = function () {};
    Object.defineProperty(fn, 'name', { value: '   ' });
    expect(() => resolveWorkflowType(fn)).toThrow(ConfigurationError);
  });
});

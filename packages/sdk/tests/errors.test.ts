import { describe, it, expect } from 'vitest';
import {
  ERROR_CODES,
  AiRuntimeError,
  ModelNotFoundError,
  ToolNotRegisteredError,
  ToolValidationError,
  BudgetExceededError,
  ConfigurationError,
} from '../src/sdk/errors';

describe('errors', () => {
  describe('AiRuntimeError', () => {
    it('is instanceof Error and AiRuntimeError', () => {
      const err = new AiRuntimeError('test', 'TEST_CODE');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AiRuntimeError);
      expect(err.name).toBe('AiRuntimeError');
      expect(err.message).toBe('test');
      expect(err.code).toBe('TEST_CODE');
    });
  });

  describe('ModelNotFoundError', () => {
    it('has correct code and message', () => {
      const err = new ModelNotFoundError('fast');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AiRuntimeError);
      expect(err).toBeInstanceOf(ModelNotFoundError);
      expect(err.code).toBe(ERROR_CODES.MODEL_NOT_FOUND);
      expect(err.message).toContain('fast');
      expect(err.message).toContain('not registered');
    });
  });

  describe('ToolNotRegisteredError', () => {
    it('has correct code and message', () => {
      const err = new ToolNotRegisteredError('calculator');
      expect(err).toBeInstanceOf(AiRuntimeError);
      expect(err).toBeInstanceOf(ToolNotRegisteredError);
      expect(err.code).toBe(ERROR_CODES.TOOL_NOT_REGISTERED);
      expect(err.message).toContain('calculator');
      expect(err.message).toContain('defineTool');
    });
  });

  describe('ToolValidationError', () => {
    it('serializes details to message', () => {
      const err = new ToolValidationError('calc', { issues: ['invalid'] });
      expect(err).toBeInstanceOf(AiRuntimeError);
      expect(err).toBeInstanceOf(ToolValidationError);
      expect(err.code).toBe(ERROR_CODES.TOOL_VALIDATION);
      expect(err.message).toContain('calc');
      expect(err.message).toContain('validation failed');
      expect(err.message).toContain('issues');
    });

    it('handles unserializable details', () => {
      const circular: { self?: unknown } = {};
      circular.self = circular;
      const err = new ToolValidationError('tool', circular);
      expect(err.message).toContain('[unserializable details]');
    });
  });

  describe('BudgetExceededError', () => {
    it('uses default message', () => {
      const err = new BudgetExceededError();
      expect(err).toBeInstanceOf(AiRuntimeError);
      expect(err).toBeInstanceOf(BudgetExceededError);
      expect(err.code).toBe(ERROR_CODES.BUDGET_EXCEEDED);
      expect(err.message).toBe('Budget limit exceeded.');
    });

    it('accepts custom message', () => {
      const err = new BudgetExceededError('Cost limit hit');
      expect(err.message).toBe('Cost limit hit');
    });
  });

  describe('ConfigurationError', () => {
    it('has correct code and message', () => {
      const err = new ConfigurationError('Model id must be a non-empty string.');
      expect(err).toBeInstanceOf(AiRuntimeError);
      expect(err).toBeInstanceOf(ConfigurationError);
      expect(err.code).toBe(ERROR_CODES.CONFIGURATION);
      expect(err.message).toBe('Model id must be a non-empty string.');
    });
  });
});

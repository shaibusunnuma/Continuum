import { describe, it, expect, beforeEach } from 'vitest';
import type { LanguageModel } from 'ai';
import {
  defineModels,
  getModelInstance,
  getModelOptions,
  clearModelRegistry,
} from '../../src/sdk/ai/model-registry';
import { ModelNotFoundError, ConfigurationError } from '../../src/sdk/errors';

const fakeModel: LanguageModel = {
  specificationVersion: 'v2',
  provider: 'test',
  modelId: 'test-model',
} as LanguageModel;

describe('model-registry', () => {
  beforeEach(() => {
    clearModelRegistry();
  });

  describe('defineModels / getModelInstance / getModelOptions', () => {
    it('registers models and getModelInstance returns them', () => {
      defineModels({ fast: fakeModel });
      const model = getModelInstance('fast');
      expect(model).toBe(fakeModel);
      expect(model.provider).toBe('test');
      expect(model.modelId).toBe('test-model');
    });

    it('stores maxTokens when using wrapper', () => {
      defineModels({
        custom: { model: fakeModel, maxTokens: 4096 },
      });
      expect(getModelInstance('custom')).toBe(fakeModel);
      expect(getModelOptions('custom')).toEqual({ maxTokens: 4096 });
    });

    it('getModelOptions returns undefined maxTokens when not set', () => {
      defineModels({ fast: fakeModel });
      expect(getModelOptions('fast')).toEqual({ maxTokens: undefined });
    });

    it('getModelInstance throws ModelNotFoundError for unknown id', () => {
      expect(() => getModelInstance('unknown')).toThrow(ModelNotFoundError);
      expect(() => getModelInstance('unknown')).toThrow('not registered');
    });

    it('getModelOptions throws ModelNotFoundError for unknown id', () => {
      expect(() => getModelOptions('unknown')).toThrow(ModelNotFoundError);
    });
  });

  describe('validation', () => {
    it('rejects empty model id', () => {
      expect(() => defineModels({ '': fakeModel })).toThrow(ConfigurationError);
      expect(() => defineModels({ '   ': fakeModel })).toThrow(ConfigurationError);
    });

    it('rejects null value', () => {
      expect(() =>
        defineModels({ fast: null as unknown as LanguageModel }),
      ).toThrow(ConfigurationError);
    });

    it('rejects value without LanguageModel shape', () => {
      expect(() =>
        defineModels({ fast: {} as LanguageModel }),
      ).toThrow(ConfigurationError);
      expect(() =>
        defineModels({ fast: { provider: 'x' } as LanguageModel }),
      ).toThrow(ConfigurationError);
    });

    it('rejects wrapper with invalid model', () => {
      expect(() =>
        defineModels({
          fast: { model: {} as LanguageModel },
        }),
      ).toThrow(ConfigurationError);
      expect(() =>
        defineModels({
          fast: { model: fakeModel, maxTokens: -1 },
        }),
      ).toThrow(ConfigurationError);
    });

    it('rejects non-integer maxTokens', () => {
      expect(() =>
        defineModels({
          fast: { model: fakeModel, maxTokens: 1.5 },
        }),
      ).toThrow(ConfigurationError);
    });
  });

  describe('clearModelRegistry', () => {
    it('empties the registry', () => {
      defineModels({ fast: fakeModel });
      clearModelRegistry();
      expect(() => getModelInstance('fast')).toThrow(ModelNotFoundError);
    });
  });
});

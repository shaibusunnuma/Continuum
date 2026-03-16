import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  defineTool,
  defineTools,
  getToolDefinition,
  getAISDKTools,
  getToolSchemas,
  clearToolRegistry,
} from '../../src/sdk/ai/tool-registry';
import { ToolNotRegisteredError, ConfigurationError } from '../../src/sdk/errors';

const calculatorDef = {
  name: 'calculator',
  description: 'Evaluate a math expression',
  input: z.object({ expression: z.string() }),
  output: z.object({ result: z.number() }),
  execute: async (input: { expression: string }) => ({ result: 42 }),
};

describe('tool-registry', () => {
  beforeEach(() => {
    clearToolRegistry();
  });

  describe('defineTool / getToolDefinition', () => {
    it('registers a tool and getToolDefinition returns it', () => {
      defineTool(calculatorDef);
      const def = getToolDefinition('calculator');
      expect(def.name).toBe('calculator');
      expect(def.description).toBe('Evaluate a math expression');
      expect(def.execute).toBe(calculatorDef.execute);
    });

    it('getToolDefinition throws ToolNotRegisteredError for unknown name', () => {
      expect(() => getToolDefinition('unknown')).toThrow(ToolNotRegisteredError);
      expect(() => getToolDefinition('unknown')).toThrow('not registered');
    });
  });

  describe('defineTools', () => {
    it('registers multiple tools', () => {
      const echo = {
        name: 'echo',
        description: 'Echo input',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        execute: async (input: { text: string }) => ({ text: input.text }),
      };
      defineTools([calculatorDef, echo]);
      expect(getToolDefinition('calculator').name).toBe('calculator');
      expect(getToolDefinition('echo').name).toBe('echo');
    });
  });

  describe('validation', () => {
    it('rejects empty name', () => {
      expect(() =>
        defineTool({ ...calculatorDef, name: '' }),
      ).toThrow(ConfigurationError);
      expect(() =>
        defineTool({ ...calculatorDef, name: '   ' }),
      ).toThrow(ConfigurationError);
    });

    it('rejects non-string description', () => {
      expect(() =>
        defineTool({ ...calculatorDef, description: 1 as unknown as string }),
      ).toThrow(ConfigurationError);
    });

    it('rejects non-Zod input', () => {
      expect(() =>
        defineTool({ ...calculatorDef, input: {} as z.ZodType }),
      ).toThrow(ConfigurationError);
    });

    it('rejects non-Zod output', () => {
      expect(() =>
        defineTool({ ...calculatorDef, output: {} as z.ZodType }),
      ).toThrow(ConfigurationError);
    });

    it('rejects non-function execute', () => {
      expect(() =>
        defineTool({ ...calculatorDef, execute: 'not a function' as unknown as (input: { expression: string }) => Promise<{ result: number }> }),
      ).toThrow(ConfigurationError);
    });
  });

  describe('getAISDKTools', () => {
    it('returns AI SDK Tool objects with description and inputSchema', () => {
      defineTool(calculatorDef);
      const tools = getAISDKTools(['calculator']);
      expect(Object.keys(tools)).toEqual(['calculator']);
      expect(tools.calculator).toBeDefined();
      expect(typeof tools.calculator).toBe('object');
      // AI SDK tool is created with description and inputSchema
      const t = tools.calculator as { description?: string };
      expect(t.description).toBe('Evaluate a math expression');
    });

    it('throws for unregistered tool name', () => {
      expect(() => getAISDKTools(['calculator'])).toThrow(ToolNotRegisteredError);
    });
  });

  describe('getToolSchemas', () => {
    it('returns JSON Schema for each tool input', () => {
      defineTool(calculatorDef);
      const schemas = getToolSchemas(['calculator']);
      expect(schemas).toHaveLength(1);
      expect(schemas[0].name).toBe('calculator');
      expect(schemas[0].description).toBe('Evaluate a math expression');
      expect(schemas[0].parameters).toBeDefined();
      expect(typeof schemas[0].parameters).toBe('object');
    });

    it('throws for unregistered tool name', () => {
      expect(() => getToolSchemas(['calculator'])).toThrow(ToolNotRegisteredError);
    });
  });

  describe('clearToolRegistry', () => {
    it('empties the registry', () => {
      defineTool(calculatorDef);
      clearToolRegistry();
      expect(() => getToolDefinition('calculator')).toThrow(ToolNotRegisteredError);
    });
  });
});

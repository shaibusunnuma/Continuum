import { tool as aiTool, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolDefinition, ToolSchema } from '../types';
import { ConfigurationError, ToolNotRegisteredError } from '../errors';

// ---------------------------------------------------------------------------
// Singleton registry
// ---------------------------------------------------------------------------

const registry = new Map<string, ToolDefinition>();

function isZodType(value: unknown): value is z.ZodTypeAny {
  return value != null && typeof value === 'object' && 'safeParse' in value;
}

function validateToolDefinition(def: ToolDefinition): void {
  if (typeof def.name !== 'string' || def.name.trim() === '') {
    throw new ConfigurationError('Tool name must be a non-empty string.');
  }
  if (typeof def.description !== 'string') {
    throw new ConfigurationError(
      `Tool "${def.name}": description must be a string.`,
    );
  }
  if (!isZodType(def.input)) {
    throw new ConfigurationError(
      `Tool "${def.name}": input must be a Zod schema.`,
    );
  }
  if (!isZodType(def.output)) {
    throw new ConfigurationError(
      `Tool "${def.name}": output must be a Zod schema.`,
    );
  }
  if (typeof def.execute !== 'function') {
    throw new ConfigurationError(
      `Tool "${def.name}": execute must be a function.`,
    );
  }
}

/**
 * Registers a single tool in the singleton registry. Call at worker startup.
 * @param def - Tool definition (name, description, Zod input/output schemas, execute function)
 */
export function defineTool<TInput, TOutput>(
  def: ToolDefinition<TInput, TOutput>,
): void {
  validateToolDefinition(def as ToolDefinition);
  registry.set(def.name, def as ToolDefinition);
}

/** Registers multiple tools at once. Convenience wrapper around defineTool. */
export function defineTools(defs: ToolDefinition[]): void {
  for (const def of defs) {
    defineTool(def);
  }
}

/**
 * Returns the full tool definition (schemas + execute) for a registered tool. Used by the runTool activity.
 * @param name - Tool name as registered with defineTool
 * @throws If the tool is not registered
 */
export function getToolDefinition(name: string): ToolDefinition {
  const def = registry.get(name);
  if (!def) {
    throw new ToolNotRegisteredError(name);
  }
  return def;
}

/**
 * Returns Vercel AI SDK–compatible tool objects for generateText({ tools }). Schema and description only; execution is via runTool activity.
 * @param names - Array of registered tool names
 */
export function getAISDKTools(names: string[]): Record<string, Tool> {
  const tools: Record<string, Tool> = {};
  for (const name of names) {
    const def = getToolDefinition(name);
    tools[name] = aiTool({
      description: def.description,
      inputSchema: def.input,
    });
  }
  return tools;
}

/**
 * Returns JSON Schema for each tool's input (for serialization across the Temporal boundary). Used when passing tool info to runModel.
 * @param names - Array of registered tool names
 */
export function getToolSchemas(names: string[]): ToolSchema[] {
  return names.map((name) => {
    const def = getToolDefinition(name);
    return {
      name: def.name,
      description: def.description,
      parameters: z.toJSONSchema(def.input) as Record<string, unknown>,
    };
  });
}

/** Clears all registered tools. Used mainly for tests. */
export function clearToolRegistry(): void {
  registry.clear();
}

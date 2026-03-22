/**
 * Typed error hierarchy for the Durion SDK.
 * Use instanceof checks for programmatic error handling.
 */

export const ERROR_CODES = {
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  TOOL_NOT_REGISTERED: 'TOOL_NOT_REGISTERED',
  TOOL_VALIDATION: 'TOOL_VALIDATION',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  CONFIGURATION: 'CONFIGURATION',
} as const;

/** Base class for all SDK errors. */
export class AiRuntimeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when a model id is not registered (e.g. getModelInstance, getModelOptions). */
export class ModelNotFoundError extends AiRuntimeError {
  constructor(modelId: string) {
    super(
      `Model "${modelId}" not registered. Call defineModels() first.`,
      ERROR_CODES.MODEL_NOT_FOUND,
    );
  }
}

/** Thrown when a tool name is not registered (e.g. getToolDefinition). */
export class ToolNotRegisteredError extends AiRuntimeError {
  constructor(toolName: string) {
    super(
      `Tool "${toolName}" not registered. Call defineTool() first.`,
      ERROR_CODES.TOOL_NOT_REGISTERED,
    );
  }
}

/** Thrown when tool input fails Zod validation in runTool activity. */
export class ToolValidationError extends AiRuntimeError {
  constructor(toolName: string, details: unknown) {
    let detailsStr: string;
    try {
      detailsStr = JSON.stringify(details);
    } catch {
      detailsStr = '[unserializable details]';
    }
    super(
      `Tool "${toolName}" input validation failed: ${detailsStr}`,
      ERROR_CODES.TOOL_VALIDATION,
    );
  }
}

/** Thrown when an agent run exceeds its budget limit (maxCostUsd or maxTokens). */
export class BudgetExceededError extends AiRuntimeError {
  constructor(message: string = 'Budget limit exceeded.') {
    super(message, ERROR_CODES.BUDGET_EXCEEDED);
  }
}

/** Thrown when configuration is invalid (defineModels, defineTool, workflow, agent). */
export class ConfigurationError extends AiRuntimeError {
  constructor(message: string) {
    super(message, ERROR_CODES.CONFIGURATION);
  }
}

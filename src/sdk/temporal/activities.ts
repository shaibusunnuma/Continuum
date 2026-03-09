import { generateText, type ModelMessage } from 'ai';
import {
  getModelInstance,
  getModelConfig,
} from '../ai/model-registry';
import { getToolDefinition, getAISDKTools } from '../ai/tool-registry';
import { calculateCostUsd } from '../ai/cost';
import type {
  RunModelParams,
  RunModelResult,
  RunToolParams,
  RunToolResult,
  Message,
  ToolCall,
} from '../types';

// ---------------------------------------------------------------------------
// runModel — calls an LLM via Vercel AI SDK
// ---------------------------------------------------------------------------

function toModelMessages(messages: Message[]): ModelMessage[] {
  return messages.map((m): ModelMessage => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: m.toolCallId ?? '',
            toolName: m.toolName ?? '',
            output: { type: 'text', value: m.content },
          },
        ],
      };
    }
    if (m.role === 'assistant') {
      if (m.toolCalls && m.toolCalls.length > 0) {
        const parts: Array<{ type: 'tool-call'; toolCallId: string; toolName: string; input: unknown } | { type: 'text'; text: string }> = [];
        if (m.content) {
          parts.push({ type: 'text', text: m.content });
        }
        for (const tc of m.toolCalls) {
          parts.push({
            type: 'tool-call',
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.arguments,
          });
        }
        return { role: 'assistant', content: parts } as ModelMessage;
      }
      return { role: 'assistant', content: m.content };
    }
    if (m.role === 'system') {
      return { role: 'system', content: m.content };
    }
    return { role: 'user', content: m.content };
  });
}

/**
 * Temporal activity: calls an LLM via the Vercel AI SDK. Resolves the model from the registry, runs generateText, and computes cost.
 * @param params - modelId, messages, optional toolNames and responseFormat
 * @returns Content, tool calls (if any), and usage including costUsd
 */
export async function runModel(params: RunModelParams): Promise<RunModelResult> {
  const model = getModelInstance(params.modelId);
  const cfg = getModelConfig(params.modelId);

  const tools =
    params.toolNames && params.toolNames.length > 0
      ? getAISDKTools(params.toolNames)
      : undefined;

  const result = await generateText({
    model,
    messages: toModelMessages(params.messages),
    tools,
    maxOutputTokens: cfg.maxTokens,
  });

  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;

  const costUsd = await calculateCostUsd(cfg.provider, cfg.model, {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
  });

  const toolCalls: ToolCall[] = (result.toolCalls ?? []).map((tc) => ({
    id: tc.toolCallId,
    name: tc.toolName,
    arguments: (tc.input ?? {}) as Record<string, unknown>,
  }));

  return {
    content: result.text ?? '',
    toolCalls,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd,
    },
  };
}

// ---------------------------------------------------------------------------
// runTool — executes a registered tool with input validation
// ---------------------------------------------------------------------------

/**
 * Temporal activity: looks up a tool by name, validates input with Zod, runs execute(), and returns the result.
 * @param params - toolName and input (validated against the tool's input schema)
 * @returns { result } - The tool's return value
 * @throws If the tool is not registered or input validation fails
 */
export async function runTool(params: RunToolParams): Promise<RunToolResult> {
  const def = getToolDefinition(params.toolName);

  const parsed = def.input.safeParse(params.input);
  if (!parsed.success) {
    throw new Error(
      `Tool "${params.toolName}" input validation failed: ${JSON.stringify((parsed as any).error)}`,
    );
  }

  const result = await def.execute(parsed.data);
  return { result };
}

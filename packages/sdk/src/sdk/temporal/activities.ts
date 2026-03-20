import { generateText, jsonSchema, Output, streamText, type ModelMessage } from 'ai';
import { tool as aiTool, type Tool } from 'ai';
import { calculateCostUsd } from '../ai/cost';
import { getActiveRuntime } from '../runtime';
import { withSpan } from '../obs';
import {
  recordModelCall,
  recordModelTokens,
  recordModelCost,
  recordToolCall,
} from '../obs-metrics';
import type {
  RunModelParams,
  RunModelResult,
  RunToolParams,
  RunToolResult,
  Message,
  ToolCall,
} from '../types';
import type { LifecycleEvent } from '../hooks';
import { ConfigurationError, ToolValidationError } from '../errors';

// ---------------------------------------------------------------------------
// runModel — calls an LLM via Vercel AI SDK
// ---------------------------------------------------------------------------

/**
 * Converts SDK Message types to Vercel AI SDK ModelMessage types.
 * NOTE: This mapping is tightly coupled to AI SDK's ModelMessage shape (v6.x).
 * If the AI SDK changes its message format, this function must be updated accordingly.
 */
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
function traceContextAttrs(tc?: { workflowId?: string; runId?: string; workflowName?: string; agentName?: string }): Record<string, string> {
  if (!tc) return {};
  const a: Record<string, string> = {};
  if (tc.workflowId) a['ai.workflow_id'] = tc.workflowId;
  if (tc.runId) a['ai.run_id'] = tc.runId;
  if (tc.workflowName) a['ai.workflow_name'] = tc.workflowName;
  if (tc.agentName) a['ai.agent_name'] = tc.agentName;
  return a;
}

export async function runModel(params: RunModelParams): Promise<RunModelResult> {
  const runtime = getActiveRuntime();
  const model = runtime.getModelInstance(params.modelId);
  const options = runtime.getModelOptions(params.modelId);

  // Build AI SDK tool objects from runtime tool registry
  let tools: Record<string, Tool> | undefined;
  if (params.toolNames && params.toolNames.length > 0) {
    tools = {};
    for (const name of params.toolNames) {
      const def = runtime.getToolDefinition(name);
      tools[name] = aiTool({
        description: def.description,
        inputSchema: def.input,
      });
    }
  }

  const baseAttrs: Record<string, string | number> = {
    'ai.model_id': params.modelId,
    ...traceContextAttrs(params.traceContext),
  };

  let result: {
    genText: string;
    genToolCalls: Array<{ toolCallId: string; toolName: string; input?: unknown }>;
    parsedObject: unknown | undefined;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  try {
    result = await withSpan(
    'ai.run_model',
    baseAttrs,
    async (span) => {
      let genText: string = '';
      let genToolCalls: Array<{ toolCallId: string; toolName: string; input?: unknown }> = [];
      let parsedObject: unknown | undefined;
      let inputTokens = 0;
      let outputTokens = 0;

      if (params.stream) {
        const workflowId = params.traceContext?.workflowId;
        if (!workflowId || typeof workflowId !== 'string' || workflowId.trim() === '') {
          throw new ConfigurationError(
            'Streaming requires traceContext.workflowId to be set so chunks can be routed safely.',
          );
        }

        const st = streamText({
          model,
          messages: toModelMessages(params.messages),
          tools,
          maxRetries: 3,
          maxOutputTokens: options.maxTokens,
        });

        const channel = workflowId;
        let assembled = '';

        try {
          for await (const part of st.fullStream) {
            if (part.type === 'text-delta') {
              const delta =
                (part as unknown as { textDelta?: string }).textDelta ??
                (part as unknown as { text?: string }).text ??
                '';
              if (delta) {
                assembled += delta;
                runtime.streamBus.publish(channel, {
                  type: 'text-delta',
                  workflowId: channel,
                  payload: { text: delta },
                });
              }
            } else if (part.type === 'tool-call') {
              // Capture tool calls in the return value (consistent with non-streaming generateText path)
              genToolCalls.push({
                toolCallId: (part as unknown as { toolCallId?: string }).toolCallId ?? '',
                toolName: (part as unknown as { toolName?: string }).toolName ?? '',
                input: (part as unknown as { args?: unknown; input?: unknown }).args ??
                  (part as unknown as { input?: unknown }).input,
              });
              runtime.streamBus.publish(channel, {
                type: 'tool-call',
                workflowId: channel,
                payload: part,
              });
            } else if (part.type === 'tool-result') {
              runtime.streamBus.publish(channel, {
                type: 'tool-result',
                workflowId: channel,
                payload: part,
              });
            } else if (part.type === 'finish') {
              const totalUsage =
                (part as unknown as { totalUsage?: { inputTokens?: number; outputTokens?: number } })
                  .totalUsage ??
                (part as unknown as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
              inputTokens = totalUsage?.inputTokens ?? 0;
              outputTokens = totalUsage?.outputTokens ?? 0;
            }
          }
          runtime.streamBus.publish(channel, {
            type: 'finish',
            workflowId: channel,
          });
        } catch (err) {
          runtime.streamBus.publish(channel, {
            type: 'error',
            workflowId: channel,
            payload: { message: (err as Error).message },
          });
          throw err;
        }

        genText = assembled;
      } else if (params.outputSchema) {
        // Structured output path: use generateText with Output.object(); tools are passed when toolNames is set
        const objResult = await generateText({
          model,
          messages: toModelMessages(params.messages),
          output: Output.object({ schema: jsonSchema(params.outputSchema) }),
          tools,
          maxOutputTokens: options.maxTokens,
        });
        parsedObject = objResult.output;
        genText = JSON.stringify(objResult.output);
        genToolCalls = objResult.toolCalls ?? [];
        inputTokens = objResult.usage?.inputTokens ?? 0;
        outputTokens = objResult.usage?.outputTokens ?? 0;
      } else {
        // Standard text generation path
        const textResult = await generateText({
          model,
          messages: toModelMessages(params.messages),
          tools,
          maxOutputTokens: options.maxTokens,
        });
        genText = textResult.text ?? '';
        genToolCalls = textResult.toolCalls ?? [];
        inputTokens = textResult.usage?.inputTokens ?? 0;
        outputTokens = textResult.usage?.outputTokens ?? 0;
      }

      let costUsd = 0;
      if (
        model &&
        typeof model === 'object' &&
        'provider' in model &&
        'modelId' in model
      ) {
        const m = model as { provider: string; modelId: string };
        costUsd = await calculateCostUsd(m.provider, m.modelId, {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
        });
      }

      if (span) {
        span.setAttributes({
          'ai.usage.prompt_tokens': inputTokens,
          'ai.usage.completion_tokens': outputTokens,
          'ai.usage.total_tokens': inputTokens + outputTokens,
          'ai.usage.cost_usd': costUsd,
        });
        if (
          model &&
          typeof model === 'object' &&
          'provider' in model &&
          'modelId' in model
        ) {
          const m = model as { provider: string; modelId: string };
          span.setAttributes({
            'ai.model.provider': m.provider,
            'ai.model.id': m.modelId,
          });
        }
        if (params.toolNames?.length) {
          span.setAttribute('ai.tools_used', params.toolNames.join(','));
        }
      }

      return {
        genText,
        genToolCalls,
        parsedObject,
        inputTokens,
        outputTokens,
        costUsd,
      };
    },
  );
  } catch (err) {
    const provider =
      model && typeof model === 'object' && 'provider' in model
        ? (model as { provider: string }).provider
        : 'unknown';
    recordModelCall({
      model: params.modelId,
      provider,
      workflow: params.traceContext?.workflowName,
      agent: params.traceContext?.agentName,
      status: 'error',
    });
    throw err;
  }

  const toolCalls: ToolCall[] = (result.genToolCalls ?? []).map((tc) => ({
    id: tc.toolCallId,
    name: tc.toolName,
    arguments: (tc.input ?? {}) as Record<string, unknown>,
  }));

  const provider =
    model && typeof model === 'object' && 'provider' in model
      ? (model as { provider: string }).provider
      : 'unknown';
  recordModelCall({
    model: params.modelId,
    provider,
    workflow: params.traceContext?.workflowName,
    agent: params.traceContext?.agentName,
    status: 'success',
  });
  recordModelTokens(params.modelId, provider, 'prompt', result.inputTokens);
  recordModelTokens(params.modelId, provider, 'completion', result.outputTokens);
  recordModelCost(params.modelId, provider, result.costUsd);

  return {
    content: result.genText,
    toolCalls,
    usage: {
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
      totalTokens: result.inputTokens + result.outputTokens,
      costUsd: result.costUsd,
    },
    ...(result.parsedObject !== undefined ? { parsedObject: JSON.stringify(result.parsedObject) } : {}),
  };
}

// ---------------------------------------------------------------------------
// runLifecycleHooks — dispatches to registered hooks (e.g. eval plugin)
// ---------------------------------------------------------------------------

export async function runLifecycleHooks(event: LifecycleEvent): Promise<void> {
  const runtime = getActiveRuntime();
  await runtime.dispatchHooks(event);
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
  const runtime = getActiveRuntime();
  const def = runtime.getToolDefinition(params.toolName);

  const parsed = def.input.safeParse(params.input);
  if (!parsed.success) {
    recordToolCall({
      tool: params.toolName,
      workflow: params.traceContext?.workflowName,
      agent: params.traceContext?.agentName,
      status: 'validation_error',
    });
    throw new ToolValidationError(
      params.toolName,
      (parsed as { error: unknown }).error,
    );
  }

  const attrs: Record<string, string> = {
    'ai.tool_name': params.toolName,
    ...traceContextAttrs(params.traceContext),
  };

  try {
    const result = await withSpan(
      'ai.run_tool',
      attrs,
      async (span) => def.execute(parsed.data),
    );
    recordToolCall({
      tool: params.toolName,
      workflow: params.traceContext?.workflowName,
      agent: params.traceContext?.agentName,
      status: 'success',
    });
    return { result };
  } catch (err) {
    recordToolCall({
      tool: params.toolName,
      workflow: params.traceContext?.workflowName,
      agent: params.traceContext?.agentName,
      status: 'error',
    });
    throw err;
  }
}

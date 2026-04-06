import { generateText, jsonSchema, Output, streamText, type ModelMessage } from 'ai';
import { tool as aiTool, type Tool } from 'ai';
import { Context } from '@temporalio/activity';
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
  CostAttribution,
} from '../types';
import { normalizeCostCalculationResult } from '../pricing';
import { dispatchHooks as dispatchRegisteredHooks, type LifecycleEvent } from '../hooks';
import { ConfigurationError, ToolValidationError } from '../errors';
import { redisStreamChannelKey } from '../streaming/stream-channel';

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
  if (tc.workflowId) a['durion.workflowId'] = tc.workflowId;
  if (tc.runId) a['durion.runId'] = tc.runId;
  if (tc.workflowName) a['durion.workflowName'] = tc.workflowName;
  if (tc.agentName) a['durion.agentName'] = tc.agentName;
  return a;
}

/** Span attributes from Temporal activity context (Studio / OTLP correlation with history). */
function durionTemporalContextAttrs(): Record<string, string> {
  try {
    const info = Context.current().info;
    return {
      'durion.activityId': info.activityId,
      'durion.workflowType': info.workflowType,
      'durion.workflowId': info.workflowExecution.workflowId,
      'durion.runId': info.workflowExecution.runId,
    };
  } catch {
    return {};
  }
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

  // Merge delegate tool descriptions (child workflows exposed as tools to the model).
  // These have a fixed { message: string } input schema — execution is handled by the
  // workflow (via executeChild), not the activity.
  if (params.extraTools && params.extraTools.length > 0) {
    if (!tools) tools = {};
    for (const extra of params.extraTools) {
      tools[extra.name] = aiTool({
        description: extra.description,
        inputSchema: jsonSchema({ type: 'object', properties: { message: { type: 'string' } }, required: ['message'] }),
      });
    }
  }

  const baseAttrs: Record<string, string | number> = {
    'durion.modelId': params.modelId,
    ...traceContextAttrs(params.traceContext),
    ...durionTemporalContextAttrs(),
  };

  let result: {
    genText: string;
    genToolCalls: Array<{ toolCallId: string; toolName: string; input?: unknown }>;
    parsedObject: unknown | undefined;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    costAttribution?: CostAttribution;
    latencyMs: number;
  };
  try {
    result = await withSpan(
      'durion.run_model',
      baseAttrs,
      async (span) => {
        let genText: string = '';
        let genToolCalls: Array<{ toolCallId: string; toolName: string; input?: unknown }> = [];
        let parsedObject: unknown | undefined;
        let inputTokens = 0;
        let outputTokens = 0;

        const startTime = performance.now();

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

          const channel = redisStreamChannelKey(workflowId);
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

        const latencyMs = Math.round(performance.now() - startTime);
        const requestedAtMs = Date.now();

        let costUsd = 0;
        let costAttribution: CostAttribution | undefined;
        if (
          params.costCalculator &&
          model &&
          typeof model === 'object' &&
          'provider' in model &&
          'modelId' in model
        ) {
          const calc = runtime.getCostCalculator(params.costCalculator);
          if (calc) {
            const m = model as { provider: string; modelId: string };
            // Attempt is 1-indexed (first try = 1)
            let retries = 0;
            try {
              retries = Math.max(0, Context.current().info.attempt - 1);
            } catch {
              // Not running inside a Temporal Activity context (e.g. unit test fallback)
            }

            const normalized = await normalizeCostCalculationResult(
              calc.calculate({
                inputTokens,
                outputTokens,
                model: m.modelId,
                provider: m.provider,
                requestedAtMs,
                metadata: {
                  retries,
                  latencyMs,
                },
              }),
            );
            costUsd = normalized.costUsd;
            costAttribution = normalized.attribution;
          }
        }

        if (span) {
          span.setAttributes({
            'durion.usage.prompt_tokens': inputTokens,
            'durion.usage.completion_tokens': outputTokens,
            'durion.usage.total_tokens': inputTokens + outputTokens,
            'durion.usage.cost_usd': costUsd,
          });
          if (
            model &&
            typeof model === 'object' &&
            'provider' in model &&
            'modelId' in model
          ) {
            const m = model as { provider: string; modelId: string };
            span.setAttributes({
              'durion.model.provider': m.provider,
              'durion.model.id': m.modelId,
            });
          }
          if (costAttribution) {
            span.setAttributes({
              'durion.cost.pricing_table_id': costAttribution.pricingTableId,
              'durion.cost.input_usd_per_1m': costAttribution.inputUsdPer1M,
              'durion.cost.output_usd_per_1m': costAttribution.outputUsdPer1M,
            });
            if (costAttribution.pricingEffectiveAt != null) {
              span.setAttribute('durion.cost.effective_at', costAttribution.pricingEffectiveAt);
            }
          }
          if (params.toolNames?.length) {
            span.setAttribute('durion.toolsUsed', params.toolNames.join(','));
          }
        }

        return {
          genText,
          genToolCalls,
          parsedObject,
          inputTokens,
          outputTokens,
          costUsd,
          costAttribution,
          latencyMs,
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

  const toolCalls: ToolCall[] = (result.genToolCalls ?? []).map((tc) => {
    let timeout: string | number | undefined;
    try {
      const def = runtime.getToolDefinition(tc.toolName);
      timeout = def.timeout;
    } catch {
      // Ignored: delegate tools or extra tools won't be in the tool registry.
    }
    return {
      id: tc.toolCallId,
      name: tc.toolName,
      arguments: (tc.input ?? {}) as Record<string, unknown>,
      timeout,
    };
  });

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
      ...(result.costAttribution ? { costAttribution: result.costAttribution } : {}),
    },
    latencyMs: result.latencyMs,
    modelId: params.modelId,
    ...(result.parsedObject !== undefined ? { parsedObject: JSON.stringify(result.parsedObject) } : {}),
  };
}

// ---------------------------------------------------------------------------
// runLifecycleHooks — dispatches to registered hooks (e.g. eval plugin)
// ---------------------------------------------------------------------------

export async function runLifecycleHooks(event: LifecycleEvent): Promise<void> {
  const runtime = getActiveRuntime();
  await runtime.dispatchHooks(event);
  // Plugins (e.g. @durion/eval) use the package-level registerHook from hooks.ts.
  await dispatchRegisteredHooks(event);
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
    'durion.toolName': params.toolName,
    ...traceContextAttrs(params.traceContext),
    ...durionTemporalContextAttrs(),
  };

  try {
    const startTime = performance.now();
    const result = await withSpan(
      'durion.run_tool',
      attrs,
      async (span) => def.execute(parsed.data),
    );
    const latencyMs = Math.round(performance.now() - startTime);
    recordToolCall({
      tool: params.toolName,
      workflow: params.traceContext?.workflowName,
      agent: params.traceContext?.agentName,
      status: 'success',
    });
    return { result, latencyMs };
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

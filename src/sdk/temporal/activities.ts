import { generateText, type ModelMessage } from 'ai';
import {
  getModelInstance,
  getModelOptions,
} from '../ai/model-registry';
import { getToolDefinition, getAISDKTools } from '../ai/tool-registry';
import { calculateCostUsd } from '../ai/cost';
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
  const model = getModelInstance(params.modelId);
  const options = getModelOptions(params.modelId);

  const tools =
    params.toolNames && params.toolNames.length > 0
      ? getAISDKTools(params.toolNames)
      : undefined;

  const baseAttrs: Record<string, string | number> = {
    'ai.model_id': params.modelId,
    ...traceContextAttrs(params.traceContext),
  };

  let result: {
    genResult: Awaited<ReturnType<typeof generateText>>;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  try {
    result = await withSpan(
    'ai.run_model',
    baseAttrs,
    async (span) => {
      const genResult = await generateText({
        model,
        messages: toModelMessages(params.messages),
        tools,
        maxOutputTokens: options.maxTokens,
      });

      const inputTokens = genResult.usage?.inputTokens ?? 0;
      const outputTokens = genResult.usage?.outputTokens ?? 0;

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
        genResult,
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

  const toolCalls: ToolCall[] = (result.genResult.toolCalls ?? []).map((tc) => ({
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
    content: result.genResult.text ?? '',
    toolCalls,
    usage: {
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
      totalTokens: result.inputTokens + result.outputTokens,
      costUsd: result.costUsd,
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
    recordToolCall({
      tool: params.toolName,
      workflow: params.traceContext?.workflowName,
      agent: params.traceContext?.agentName,
      status: 'validation_error',
    });
    throw new Error(
      `Tool "${params.toolName}" input validation failed: ${JSON.stringify((parsed as any).error)}`,
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

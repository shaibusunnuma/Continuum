/**
 * Workflow-sandbox code — only @temporalio/workflow imports allowed at runtime.
 * All other imports MUST be `import type` (erased at compile time).
 * Exception: ConfigurationError is used at agent definition time (before sandbox runs).
 */
import * as wf from '@temporalio/workflow';
import type * as sdkActivities from './activities';
import type {
  AgentConfig,
  AgentResult,
  Message,
  StreamState,
  Usage,
} from '../types';
import { ConfigurationError } from '../errors';

function validateAgentConfig(name: string, config: AgentConfig): void {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ConfigurationError('Agent name must be a non-empty string.');
  }
  if (typeof config.model !== 'string' || config.model.trim() === '') {
    throw new ConfigurationError('Agent config.model must be a non-empty string.');
  }
  if (typeof config.instructions !== 'string' || config.instructions.trim() === '') {
    throw new ConfigurationError('Agent config.instructions must be a non-empty string.');
  }
  if (!Array.isArray(config.tools)) {
    throw new ConfigurationError('Agent config.tools must be an array.');
  }
}

/**
 * Defines a durable agent workflow that runs a model–tool loop (model can call tools; results are fed back until the model responds with text).
 * The returned function is a Temporal workflow; export it and use the export name as the workflow type when starting (e.g. "travelAgent").
 * @param name - Logical name for the agent (use same as export name for the workflow type)
 * @param config - model id, instructions (system prompt), tools (registered names), maxSteps, optional budgetLimit, optional activityTimeout
 * @returns A Temporal workflow function (input: { message: string }) => Promise<AgentResult>
 */
export function agent(
  name: string,
  config: AgentConfig,
): (input: { message: string }) => Promise<AgentResult> {
  validateAgentConfig(name, config);
  const maxSteps = config.maxSteps ?? 10;

  const agentFn = async function (input: { message: string }): Promise<AgentResult> {
    const { runModel, runTool, runLifecycleHooks } = wf.proxyActivities<
      typeof sdkActivities
    >({
      startToCloseTimeout: (config.activityTimeout ?? '5 minutes') as import('@temporalio/common').Duration,
      retry: { maximumAttempts: 3 },
    });
    const info = wf.workflowInfo();
    const traceCtx = {
      workflowId: info.workflowId,
      runId: info.runId,
      agentName: name,
    };

    const messages: Message[] = [
      { role: 'system', content: config.instructions },
      { role: 'user', content: input.message },
    ];

    const totalUsage: Usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };

    let stepCount = 0;
    let finishReason: AgentResult['finishReason'] = 'complete';

    // Stream state for progressive UX via Temporal queries
    let streamState: StreamState = {
      status: 'running',
      currentStep: 0,
      partialReply: undefined,
      messages: [...messages],
      updatedAt: new Date().toISOString(),
    };

    // Namespaced internal query name to avoid collisions with user-defined queries.
    // TODO: We will change the 'ai-runtime:' prefix to something shorter like 'ar:' in the future when the SDK name is finalized.
    const streamStateQuery = wf.defineQuery<StreamState>('ai-runtime:streamState');
    wf.setHandler(streamStateQuery, () => streamState);

    while (stepCount < maxSteps) {
      if (config.budgetLimit?.maxCostUsd && totalUsage.costUsd >= config.budgetLimit.maxCostUsd) {
        finishReason = 'budget_exceeded';
        break;
      }
      if (config.budgetLimit?.maxTokens && totalUsage.totalTokens >= config.budgetLimit.maxTokens) {
        finishReason = 'budget_exceeded';
        break;
      }

      stepCount++;
      streamState = {
        ...streamState,
        status: 'running',
        currentStep: stepCount,
        updatedAt: new Date().toISOString(),
      };

      const result = await runModel({
        modelId: config.model,
        messages,
        toolNames: config.tools.length > 0 ? config.tools : undefined,
        traceContext: traceCtx,
      });

      totalUsage.promptTokens += result.usage.promptTokens;
      totalUsage.completionTokens += result.usage.completionTokens;
      totalUsage.totalTokens += result.usage.totalTokens;
      totalUsage.costUsd += result.usage.costUsd;

      if (result.toolCalls.length === 0) {
        messages.push({ role: 'assistant', content: result.content });

        const finalResult: AgentResult = {
          reply: result.content,
          finishReason: 'complete',
          steps: stepCount,
          usage: totalUsage,
        };

        await runLifecycleHooks({
          type: 'run:complete',
          payload: {
            kind: 'agent',
            name,
            workflowId: info.workflowId,
            runId: info.runId,
            modelId: config.model,
            input,
            output: finalResult,
          },
        });

        return finalResult;
      }

      messages.push({
        role: 'assistant',
        content: result.content || '',
        toolCalls: result.toolCalls,
      });

      // Execute all tool calls in parallel (each is an independent Temporal activity)
      const toolResults = await Promise.all(
        result.toolCalls.map((tc) =>
          runTool({
            toolName: tc.name,
            input: tc.arguments,
            traceContext: traceCtx,
          }).then((toolResult) => ({
            role: 'tool' as const,
            content: JSON.stringify(toolResult.result),
            toolCallId: tc.id,
            toolName: tc.name,
          })),
        ),
      );

      messages.push(...toolResults);
      streamState = {
        ...streamState,
        messages: [...messages],
        updatedAt: new Date().toISOString(),
      };
    }

    if (finishReason === 'complete') {
      finishReason = 'max_steps';
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

    const finalResult: AgentResult = {
      reply: lastAssistant?.content ?? '',
      finishReason,
      steps: stepCount,
      usage: totalUsage,
    };

    await runLifecycleHooks({
      type: 'run:complete',
      payload: {
        kind: 'agent',
        name,
        workflowId: info.workflowId,
        runId: info.runId,
        modelId: config.model,
        input,
        output: finalResult,
      },
    });

    streamState = {
      status: 'completed',
      currentStep: stepCount,
      partialReply: finalResult.reply,
      messages: [...messages],
      updatedAt: new Date().toISOString(),
    };

    return finalResult;
  };

  Object.defineProperty(agentFn, 'name', { value: name });
  return agentFn;
}


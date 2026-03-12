/**
 * Workflow-sandbox code — only @temporalio/workflow imports allowed at runtime.
 * All other imports MUST be `import type` (erased at compile time).
 */
import * as wf from '@temporalio/workflow';
import type * as sdkActivities from './activities';
import type {
  AgentConfig,
  AgentResult,
  Message,
  Usage,
} from '../types';

const { runModel, runTool } = wf.proxyActivities<typeof sdkActivities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

const userInputSignal = wf.defineSignal<[unknown]>('agent-user-input');

/**
 * Defines a durable agent workflow that runs a model–tool loop (model can call tools; results are fed back until the model responds with text).
 * The returned function is a Temporal workflow; export it and use the export name as the workflow type when starting (e.g. "travelAgent").
 * @param name - Logical name for the agent (use same as export name for the workflow type)
 * @param config - model id, instructions (system prompt), tools (registered names), maxSteps, optional budgetLimit
 * @returns A Temporal workflow function (input: { message: string }) => Promise<AgentResult>
 */
export function agent(
  name: string,
  config: AgentConfig,
): (input: { message: string }) => Promise<AgentResult> {
  const maxSteps = config.maxSteps ?? 10;

  const agentFn = async function (input: { message: string }): Promise<AgentResult> {
    const info = wf.workflowInfo();
    const traceCtx = {
      workflowId: info.workflowId,
      runId: info.runId,
      agentName: name,
    };

    const inputQueue: unknown[] = [];
    wf.setHandler(userInputSignal, (data: unknown) => {
      inputQueue.push(data);
    });

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
        return {
          reply: result.content,
          finishReason: 'complete',
          steps: stepCount,
          usage: totalUsage,
        };
      }

      messages.push({
        role: 'assistant',
        content: result.content || '',
        toolCalls: result.toolCalls,
      });

      for (const tc of result.toolCalls) {
        const toolResult = await runTool({
          toolName: tc.name,
          input: tc.arguments,
          traceContext: traceCtx,
        });

        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult.result),
          toolCallId: tc.id,
          toolName: tc.name,
        });
      }
    }

    if (finishReason === 'complete') {
      finishReason = 'max_steps';
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

    return {
      reply: lastAssistant?.content ?? '',
      finishReason,
      steps: stepCount,
      usage: totalUsage,
    };
  };

  Object.defineProperty(agentFn, 'name', { value: name });
  return agentFn;
}


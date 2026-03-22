/**
 * Phase 3 metrics: model/tool call counts, tokens, cost.
 * Uses OpenTelemetry Meter when available; no-ops when metrics disabled or no provider registered.
 */
import { metrics } from '@opentelemetry/api';
import type { MetricAttributes } from '@opentelemetry/api';
import { isMetricsEnabled } from './obs';

const METER_NAME = 'durion-sdk';
const METER_VERSION = '0.1.0';

let modelCallsCounter: { add: (v: number, a?: MetricAttributes) => void } | null = null;
let modelTokensCounter: { add: (v: number, a?: MetricAttributes) => void } | null = null;
let modelCostCounter: { add: (v: number, a?: MetricAttributes) => void } | null = null;
let toolCallsCounter: { add: (v: number, a?: MetricAttributes) => void } | null = null;

function getMeter() {
  return metrics.getMeterProvider().getMeter(METER_NAME, METER_VERSION);
}

function getModelCallsCounter() {
  if (!modelCallsCounter) {
    modelCallsCounter = getMeter().createCounter('ai_model_calls_total', {
      description: 'Total number of model (LLM) calls',
    });
  }
  return modelCallsCounter;
}

function getModelTokensCounter() {
  if (!modelTokensCounter) {
    modelTokensCounter = getMeter().createCounter('ai_model_tokens_total', {
      description: 'Total tokens used (prompt + completion)',
    });
  }
  return modelTokensCounter;
}

function getModelCostCounter() {
  if (!modelCostCounter) {
    modelCostCounter = getMeter().createCounter('ai_model_cost_usd_total', {
      description: 'Total cost in USD for model calls',
    });
  }
  return modelCostCounter;
}

function getToolCallsCounter() {
  if (!toolCallsCounter) {
    toolCallsCounter = getMeter().createCounter('ai_tool_calls_total', {
      description: 'Total number of tool invocations',
    });
  }
  return toolCallsCounter;
}

export type ModelMetricAttrs = {
  model: string;
  provider: string;
  workflow?: string;
  agent?: string;
  status: 'success' | 'error';
};

export function recordModelCall(attrs: ModelMetricAttrs): void {
  if (!isMetricsEnabled()) return;
  const a: MetricAttributes = {
    model: attrs.model,
    provider: attrs.provider,
    status: attrs.status,
  };
  if (attrs.workflow) a.workflow = attrs.workflow;
  if (attrs.agent) a.agent = attrs.agent;
  getModelCallsCounter().add(1, a);
}

export function recordModelTokens(
  model: string,
  provider: string,
  type: 'prompt' | 'completion',
  count: number,
): void {
  if (!isMetricsEnabled() || count <= 0) return;
  getModelTokensCounter().add(count, { model, provider, type });
}

export function recordModelCost(model: string, provider: string, costUsd: number): void {
  if (!isMetricsEnabled() || costUsd <= 0) return;
  getModelCostCounter().add(costUsd, { model, provider });
}

export type ToolMetricAttrs = {
  tool: string;
  workflow?: string;
  agent?: string;
  status: 'success' | 'error' | 'validation_error';
};

export function recordToolCall(attrs: ToolMetricAttrs): void {
  if (!isMetricsEnabled()) return;
  const a: MetricAttributes = { tool: attrs.tool, status: attrs.status };
  if (attrs.workflow) a.workflow = attrs.workflow;
  if (attrs.agent) a.agent = attrs.agent;
  getToolCallsCounter().add(1, a);
}

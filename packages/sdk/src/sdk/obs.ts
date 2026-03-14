import type { Attributes } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import {
  context,
  trace,
  SpanStatusCode,
  ROOT_CONTEXT,
} from '@opentelemetry/api';

type TracingConfig = {
  enabled?: boolean;
};

type MetricsConfig = {
  enabled?: boolean;
};

export type ObservabilityConfig = {
  tracing?: TracingConfig;
  metrics?: MetricsConfig;
};

let tracingEnabled = false;
let metricsEnabled = false;

/**
 * Initializes SDK-level observability. Toggles tracing and metrics helpers;
 * host app may configure OTel provider/exporter separately.
 */
export function initObservability(config: ObservabilityConfig): void {
  tracingEnabled = !!config.tracing?.enabled;
  metricsEnabled = !!config.metrics?.enabled;
}

export function isTracingEnabled(): boolean {
  return tracingEnabled;
}

export function isMetricsEnabled(): boolean {
  return metricsEnabled;
}

/**
 * Internal helper to run a function within a span when tracing is enabled.
 * When tracing is disabled, it simply executes fn().
 * The callback may receive the span (or null when disabled) to set extra attributes before returning.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span | null) => Promise<T>,
): Promise<T> {
  if (!tracingEnabled) {
    return fn(null);
  }

  const tracer = trace.getTracer('ai-runtime-sdk');
  const span = tracer.startSpan(name, undefined, context.active());
  try {
    span.setAttributes(attributes);
    const result = await context.with(
      trace.setSpan(context.active(), span),
      () => fn(span),
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
}


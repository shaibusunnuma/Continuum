import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const traceExporter = new OTLPTraceExporter({
  // Follows standard OTel env vars when not explicitly set.
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

function parsePrometheusPort(): number {
  const raw = process.env.AI_RUNTIME_PROMETHEUS_PORT ?? '9464';
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 65535) {
    return 9464;
  }
  return n;
}

// Exposes metrics at http://localhost:9464/metrics for Prometheus/Grafana.
const prometheusReader = new PrometheusExporter({
  port: parsePrometheusPort(),
  endpoint: '/metrics',
});

const sdk = new NodeSDK({
  traceExporter,
  metricReader: prometheusReader,
  resource: new Resource({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'ai-runtime-example',
  }),
});

let started = false;

export async function startTelemetry(): Promise<void> {
  if (started) return;
  try {
    await sdk.shutdown(); // defensive: ensure previous state is clean
  } catch {
    // ignore if it was never started
  }

  try {
    await sdk.start();
    started = true;
  } catch (err: unknown) {
    console.error('Failed to start OpenTelemetry SDK:', err);
    throw err;
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (!started) return;
  try {
    await sdk.shutdown();
    started = false;
  } catch (err: unknown) {
    console.error('Failed to shut down OpenTelemetry SDK:', err);
  }
}


import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const LOCAL_ENDPOINT = 'http://127.0.0.1:3000/v1/traces';
const isLocal = process.env.DURION_STUDIO_LOCAL === 'true';

const traceExporter = new OTLPTraceExporter({
  url: isLocal ? LOCAL_ENDPOINT : process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  headers: {}, // Ensure it defaults to JSON inside the JS exporter
});

function parsePrometheusPort(): number {
  const raw = process.env.DURION_PROMETHEUS_PORT ?? '9464';
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
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'durion-example',
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

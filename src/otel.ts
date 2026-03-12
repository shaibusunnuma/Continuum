import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const traceExporter = new OTLPTraceExporter({
  // Follows standard OTel env vars when not explicitly set.
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

const sdk = new NodeSDK({
  traceExporter,
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]:
      process.env.OTEL_SERVICE_NAME ?? 'ai-runtime-example',
  }),
});

let started = false;

export async function startTelemetry(): Promise<void> {
  if (started) return;
  await sdk.start();
  started = true;
}

export async function shutdownTelemetry(): Promise<void> {
  if (!started) return;
  await sdk.shutdown();
  started = false;
}


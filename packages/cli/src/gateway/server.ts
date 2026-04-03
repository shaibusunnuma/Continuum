import Fastify, { type FastifyInstance } from 'fastify';
import { getTemporalClient, closeTemporalClient } from './temporal-client';
import { ingestSpans, querySpans } from './span-buffer';
import {
  buildStudioRunsStructuredQuery,
  mergeStudioRunsVisibilityQuery,
} from './visibility-query';
import type { SdkClient } from '@durion/sdk';

export interface GatewayOptions {
  port: number;
  host: string;
  temporalAddress: string;
  temporalNamespace: string;
  gatewayToken?: string;
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.message.toLowerCase().includes('not found')) return true;
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') return true;
  }
  return false;
}

function optionalRunId(q: { runId?: string }): string | undefined {
  return q.runId?.trim() || undefined;
}

function handleForRun(client: SdkClient, workflowId: string, runId?: string) {
  return runId ? client.getWorkflowHandle(workflowId, runId) : client.getWorkflowHandle(workflowId);
}

export async function createGateway(opts: GatewayOptions): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  const getClient = () => getTemporalClient({
    address: opts.temporalAddress,
    namespace: opts.temporalNamespace,
  });

  // OTLP trace ingestion for Studio
  fastify.post('/v1/traces', async (request, reply) => {
    try {
      ingestSpans(request.body);
      return reply.code(200).send({});
    } catch (err) {
      return reply.code(500).send({ error: 'Failed to ingest traces' });
    }
  });

  // Gateway v0 routes for Studio
  await fastify.register(
    async (f) => {
      // Optional auth
      if (opts.gatewayToken) {
        f.addHook('preHandler', async (request, reply) => {
          const authHeader = request.headers.authorization;
          const bearer =
            typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
              ? authHeader.slice(7).trim()
              : undefined;
          if (bearer !== opts.gatewayToken) {
            return reply.status(401).send({ error: 'Unauthorized' });
          }
        });
      }

      // --- Studio routes: /v0/studio/* ---

      f.get<{
        Querystring: {
          limit?: string;
          nextPageToken?: string;
          query?: string;
          executionStatus?: string;
          workflowType?: string;
          workflowId?: string;
          startAfter?: string;
          startBefore?: string;
          composition?: string;
          parentWorkflowId?: string;
          parentRunId?: string;
        };
      }>('/studio/runs', async (request, reply) => {
        try {
          const client = await getClient();
          const limitRaw = request.query.limit ? parseInt(request.query.limit, 10) : 20;
          const pageSize = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
          const compRaw = request.query.composition?.trim().toLowerCase();
          const composition =
            compRaw === 'roots' || compRaw === 'children' ? compRaw : undefined;

          const structured = buildStudioRunsStructuredQuery({
            executionStatus: request.query.executionStatus,
            workflowType: request.query.workflowType,
            workflowId: request.query.workflowId,
            startAfter: request.query.startAfter,
            startBefore: request.query.startBefore,
            composition,
            parentWorkflowId: request.query.parentWorkflowId,
            parentRunId: request.query.parentRunId,
          });
          const visibilityQuery = mergeStudioRunsVisibilityQuery(structured, request.query.query);
          const result = await client.listWorkflowExecutions({
            pageSize,
            nextPageToken: request.query.nextPageToken,
            query: visibilityQuery,
          });
          return reply.send({ runs: result.executions, nextPageToken: result.nextPageToken });
        } catch (err) {
          return reply.status(500).send({
            error: 'Internal server error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });

      f.get<{
        Params: { workflowId: string };
        Querystring: { runId?: string };
      }>('/studio/runs/:workflowId/spans', async (request, reply) => {
        try {
          const runId = request.query.runId?.trim() || undefined;
          const spans = querySpans(request.params.workflowId, runId);
          return reply.send(spans);
        } catch (err) {
          return reply.status(500).send({
            error: 'Internal server error fetching spans',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });

      f.get<{
        Params: { workflowId: string };
        Querystring: { runId?: string };
      }>('/studio/runs/:workflowId/history', async (request, reply) => {
        try {
          const client = await getClient();
          const runId = request.query.runId?.trim() || undefined;
          const history = await client.fetchWorkflowHistory(request.params.workflowId, runId);
          return reply.send(history);
        } catch (err) {
          const status = isNotFoundError(err) ? 404 : 500;
          return reply.status(status).send({
            error: status === 404 ? 'Run not found' : 'Internal server error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });

      // --- Run routes: /v0/runs/* ---

      f.get<{
        Params: { workflowId: string };
        Querystring: { runId?: string };
      }>('/runs/:workflowId/stream-state', async (request, reply) => {
        try {
          const client = await getClient();
          const handle = handleForRun(client, request.params.workflowId, optionalRunId(request.query));
          const state = await handle.queryStreamState();
          return reply.send(state);
        } catch (err) {
          const status = isNotFoundError(err) ? 404 : 500;
          return reply.status(status).send({
            error: status === 404 ? 'Run not found' : 'Internal server error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });

      f.get<{
        Params: { workflowId: string };
        Querystring: { runId?: string };
      }>('/runs/:workflowId/result', async (request, reply) => {
        try {
          const client = await getClient();
          const handle = handleForRun(client, request.params.workflowId, optionalRunId(request.query));
          const description = await handle.describe();

          if (description.status.name === 'RUNNING') {
            return reply.status(202).send({
              workflowId: request.params.workflowId,
              status: 'RUNNING',
              result: null,
            });
          }

          if (description.status.name === 'FAILED') {
            return reply.status(200).send({
              workflowId: request.params.workflowId,
              status: 'FAILED',
              result: null,
              error: 'Workflow execution failed',
            });
          }

          const result = await handle.result();
          return reply.send({
            workflowId: request.params.workflowId,
            status: description.status.name,
            result,
          });
        } catch (err) {
          const status = isNotFoundError(err) ? 404 : 500;
          return reply.status(status).send({
            error: status === 404 ? 'Run not found' : 'Internal server error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });

      f.get<{
        Params: { workflowId: string };
        Querystring: { runId?: string };
      }>('/runs/:workflowId', async (request, reply) => {
        try {
          const client = await getClient();
          const handle = handleForRun(client, request.params.workflowId, optionalRunId(request.query));
          const description = await handle.describe();
          const parent = description.parentExecution;
          const root = description.rootExecution;

          return reply.send({
            workflowId: request.params.workflowId,
            runId: description.runId ?? null,
            status: description.status.name,
            type: description.type,
            taskQueue: description.taskQueue ?? null,
            startTime: description.startTime?.toISOString() ?? null,
            closeTime: description.closeTime?.toISOString() ?? null,
            memo: description.memo ?? {},
            parentWorkflowId: parent?.workflowId ?? null,
            parentRunId: parent?.runId ?? null,
            rootWorkflowId: root?.workflowId ?? null,
            rootRunId: root?.runId ?? null,
          });
        } catch (err) {
          const status = isNotFoundError(err) ? 404 : 500;
          return reply.status(status).send({
            error: status === 404 ? 'Run not found' : 'Internal server error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    },
    { prefix: '/v0' },
  );

  return fastify;
}

export async function startGateway(opts: GatewayOptions): Promise<FastifyInstance> {
  const fastify = await createGateway(opts);
  await fastify.listen({ port: opts.port, host: opts.host });
  return fastify;
}

export async function stopGateway(fastify: FastifyInstance): Promise<void> {
  await fastify.close();
  await closeTemporalClient();
}

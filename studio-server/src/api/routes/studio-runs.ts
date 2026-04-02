import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { SdkClient } from '@durion/sdk';
import { getTemporalClient } from '../temporal';

function optionalRunId(q: { runId?: string }): string | undefined {
  const r = q.runId?.trim();
  return r || undefined;
}

function handleForRun(client: SdkClient, workflowId: string, runId?: string) {
  return runId ? client.getWorkflowHandle(workflowId, runId) : client.getWorkflowHandle(workflowId);
}

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.message.toLowerCase().includes('not found')) return true;
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') return true;
  }
  return false;
}

/** `/v0/runs/*` routes used by Durion Studio only (no token SSE or signals). */
export async function studioRunsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{
    Params: { workflowId: string };
    Querystring: { runId?: string };
  }>(
    '/:workflowId/stream-state',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: { workflowId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: { runId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
        const handle = handleForRun(client, request.params.workflowId, optionalRunId(request.query));
        const state = await handle.queryStreamState();
        return reply.send(state);
      } catch (err) {
        request.log.error(err);
        const status = isNotFoundError(err) ? 404 : 500;
        return reply.status(status).send({
          error: status === 404 ? 'Run not found' : 'Internal server error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  fastify.get<{
    Params: { workflowId: string };
    Querystring: { runId?: string };
  }>(
    '/:workflowId/result',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: { workflowId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: { runId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
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
        request.log.error(err);
        const status = isNotFoundError(err) ? 404 : 500;
        return reply.status(status).send({
          error: status === 404 ? 'Run not found' : 'Internal server error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  fastify.get<{
    Params: { workflowId: string };
    Querystring: { runId?: string };
  }>(
    '/:workflowId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: { workflowId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: { runId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
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
        request.log.error(err);
        const status = isNotFoundError(err) ? 404 : 500;
        return reply.status(status).send({
          error: status === 404 ? 'Run not found' : 'Internal server error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}

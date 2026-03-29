import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pipeStreamToResponse } from '@durion/sdk';
import { getTemporalClient } from '../temporal';
import { getStreamBus } from '../../stream-bus';

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.message.toLowerCase().includes('not found')) return true;
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') return true;
  }
  return false;
}

export async function runsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{
    Params: { workflowId: string };
  }>(
    '/:workflowId/stream-state',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: { workflowId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
        const handle = client.getWorkflowHandle(request.params.workflowId);
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
  }>(
    '/:workflowId/token-stream',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: { workflowId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      reply.hijack();
      try {
        await pipeStreamToResponse(getStreamBus(), request.params.workflowId, reply.raw);
      } catch (err) {
        request.log.error(err);
        if (!reply.raw.headersSent) {
          reply.raw.statusCode = 500;
          reply.raw.end();
        }
      }
    },
  );

  fastify.post<{
    Params: { workflowId: string };
    Body: { name: string; data?: unknown };
  }>(
    '/:workflowId/signal',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: { workflowId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            data: {},
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
        const handle = client.getWorkflowHandle(request.params.workflowId);
        await handle.signal(request.body.name, request.body.data);
        return reply.status(204).send();
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
  }>(
    '/:workflowId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: { workflowId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
        const handle = client.getWorkflowHandle(request.params.workflowId);
        const description = await handle.describe();

        return reply.send({
          workflowId: request.params.workflowId,
          runId: description.runId ?? null,
          status: description.status.name,
          type: description.type,
          startTime: description.startTime?.toISOString() ?? null,
          closeTime: description.closeTime?.toISOString() ?? null,
          memo: description.memo ?? {},
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
  }>(
    '/:workflowId/result',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: { workflowId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
        const handle = client.getWorkflowHandle(request.params.workflowId);
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
}

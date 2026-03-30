import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getTemporalClient } from '../temporal';
import {
  buildStudioRunsStructuredQuery,
  mergeStudioRunsVisibilityQuery,
} from '../studio-visibility-query';

function isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.message.toLowerCase().includes('not found')) return true;
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') return true;
  }
  return false;
}

export async function studioRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{
    Querystring: {
      limit?: string;
      nextPageToken?: string;
      query?: string;
      executionStatus?: string;
      workflowType?: string;
      workflowId?: string;
      startAfter?: string;
      startBefore?: string;
    };
  }>(
    '/runs',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'string' },
            nextPageToken: { type: 'string' },
            query: { type: 'string' },
            executionStatus: { type: 'string' },
            workflowType: { type: 'string' },
            workflowId: { type: 'string' },
            startAfter: { type: 'string' },
            startBefore: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
        const limitRaw = request.query.limit ? parseInt(request.query.limit, 10) : 20;
        const pageSize = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
        const structured = buildStudioRunsStructuredQuery({
          executionStatus: request.query.executionStatus,
          workflowType: request.query.workflowType,
          workflowId: request.query.workflowId,
          startAfter: request.query.startAfter,
          startBefore: request.query.startBefore,
        });
        const visibilityQuery = mergeStudioRunsVisibilityQuery(structured, request.query.query);
        const result = await client.listWorkflowExecutions({
          pageSize,
          nextPageToken: request.query.nextPageToken,
          query: visibilityQuery,
        });
        return reply.send({
          runs: result.executions,
          nextPageToken: result.nextPageToken,
        });
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal server error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  fastify.get<{
    Params: { workflowId: string };
  }>(
    '/runs/:workflowId/history',
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
        const history = await client.fetchWorkflowHistory(request.params.workflowId);
        return reply.send(history);
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

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { nanoid } from 'nanoid';
import { getTemporalClient } from '../temporal';
import { config } from '../../config';
import type { StartWorkflowResponse } from '../../types';

const startWorkflowBodySchema = {
  type: 'object',
  required: ['workflowType', 'input'],
  properties: {
    workflowType: { type: 'string' },
    input: { type: 'object' },
  },
} as const;

export async function workflowsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.post<{
    Body: { workflowType: string; input: Record<string, unknown> };
    Reply: StartWorkflowResponse | { error: string; message: string };
  }>(
    '/start',
    {
      schema: {
        body: startWorkflowBodySchema,
        response: {
          201: {
            type: 'object',
            properties: {
              workflowId: { type: 'string' },
              runId: { type: 'string' },
            },
            required: ['workflowId', 'runId'],
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
        const workflowId = `wf-${nanoid()}`;
        const handle = await client.workflow.start(request.body.workflowType, {
          taskQueue: config.TASK_QUEUE,
          workflowId,
          args: [request.body.input],
        });
        return reply.status(201).send({
          workflowId: handle.workflowId,
          runId: handle.firstExecutionRunId ?? '',
        });
      } catch (err) {
        request.log.error(err);
        return reply.status(502).send({
          error: 'Failed to start workflow',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}

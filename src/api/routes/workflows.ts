import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { nanoid } from 'nanoid';
import { getTemporalClient } from '../temporal';
import { config } from '../../shared/config';
import type { StartWorkflowResponse } from '../../shared/types';

const startWorkflowBodySchema = {
  type: 'object',
  required: ['workflowType', 'input'],
  properties: {
    workflowType: {
      type: 'string',
      enum: ['Echo'],
    },
    input: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
      },
    },
  },
} as const;

export async function workflowsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  fastify.post<{
    Body: { workflowType: 'Echo'; input: { message: string } };
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
        const workflowId = nanoid();
        const handle = await client.workflow.start('Echo', {
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
    }
  );
}

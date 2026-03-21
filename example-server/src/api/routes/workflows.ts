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
    /** Client-generated id so the UI can subscribe to SSE before start (same as Temporal workflow id). */
    workflowId: { type: 'string' },
    taskQueue: { type: 'string' },
  },
} as const;

export async function workflowsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.post<{
    Body: {
      workflowType: string;
      input: Record<string, unknown>;
      workflowId?: string;
      taskQueue?: string;
    };
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
            required: ['workflowId'],
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
        const workflowId = request.body.workflowId ?? `wf-${nanoid()}`;
        const taskQueue = request.body.taskQueue ?? config.TASK_QUEUE;
        const handle = await client.startWorkflow(request.body.workflowType, {
          taskQueue,
          workflowId,
          input: request.body.input,
        });
        const body: { workflowId: string; runId?: string } = {
          workflowId: handle.workflowId,
        };
        // SDK Client doesn't expose firstExecutionRunId directly right now
        // so we omit it or get it from describe() if needed.
        // It's not strictly required in the response.
        return reply.status(201).send(body);
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

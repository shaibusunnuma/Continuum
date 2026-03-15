import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { nanoid } from 'nanoid';
import { getTemporalClient } from '../temporal';
import { config } from '../../config';

const startAgentBodySchema = {
  type: 'object',
  required: ['agentName', 'input'],
  properties: {
    agentName: { type: 'string' },
    input: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
      },
    },
  },
} as const;

export async function agentsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.post<{
    Body: { agentName: string; input: { message: string } };
    Reply:
      | { workflowId: string; runId?: string }
      | { error: string; message: string };
  }>(
    '/start',
    {
      schema: {
        body: startAgentBodySchema,
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
        const workflowId = `agent-${nanoid()}`;
        const handle = await client.workflow.start(request.body.agentName, {
          taskQueue: config.TASK_QUEUE,
          workflowId,
          args: [request.body.input],
        });
        const body: { workflowId: string; runId?: string } = {
          workflowId: handle.workflowId,
        };
        if (handle.firstExecutionRunId != null) {
          body.runId = handle.firstExecutionRunId;
        }
        return reply.status(201).send(body);
      } catch (err) {
        request.log.error(err);
        return reply.status(502).send({
          error: 'Failed to start agent',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}

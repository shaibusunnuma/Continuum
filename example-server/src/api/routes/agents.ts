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

// Route each example agent to its dedicated task queue.
// Unknown agent names fall back to the default config.TASK_QUEUE.
const AGENT_TASK_QUEUE_MAP: Record<string, string> = {
  travelAgent: 'ai-runtime-customer-support',
  researchAssistant: 'ai-runtime-research-assistant',
  reactAgent: 'ai-runtime-react',
  memoryAgent: 'ai-runtime-memory-augmented',
  planExecuteAgent: 'ai-runtime-plan-and-execute',
};

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
        const taskQueue =
          AGENT_TASK_QUEUE_MAP[request.body.agentName] ?? config.TASK_QUEUE;
        const handle = await client.workflow.start(request.body.agentName, {
          taskQueue,
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

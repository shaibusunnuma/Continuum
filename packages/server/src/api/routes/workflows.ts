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

// Route each example workflow type to its dedicated task queue.
// Unknown workflow types fall back to the default config.TASK_QUEUE.
const WORKFLOW_TASK_QUEUE_MAP: Record<string, string> = {
  // Examples:
  customerSupport: 'ai-runtime-customer-support',
  contentBrief: 'ai-runtime-research-assistant',
  dagWorkflow: 'ai-runtime-dag',
  treeSearchWorkflow: 'ai-runtime-tree-search',
  reflectionWorkflow: 'ai-runtime-reflection',
  multiAgentWorkflow: 'ai-runtime-multi-agent',
  structuredLoopWorkflow: 'ai-runtime-structured-loop',
};

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
            required: ['workflowId'],
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
        const workflowId = `wf-${nanoid()}`;
        const taskQueue =
          WORKFLOW_TASK_QUEUE_MAP[request.body.workflowType] ??
          config.TASK_QUEUE;
        const handle = await client.workflow.start(request.body.workflowType, {
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
          error: 'Failed to start workflow',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}

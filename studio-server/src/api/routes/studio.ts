import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getTemporalClient } from '../temporal';
import {
  buildStudioRunsStructuredQuery,
  mergeStudioRunsVisibilityQuery,
} from '../studio-visibility-query';

/** Build upstream URL for GET .../runs/:workflowId/spans under `DURION_OTLP_QUERY_URL` and forward query params. */
function buildOtlpSpansProxyUrl(baseEnv: string, workflowId: string, query: Record<string, unknown>): string {
  const base = baseEnv.trim();
  const path = `runs/${encodeURIComponent(workflowId)}/spans`;
  const target = new URL(path, base.endsWith('/') ? base : `${base}/`);

  const searchParams = new URLSearchParams();
  for (const [key, val] of Object.entries(query)) {
    if (val === undefined) continue;
    const parts = Array.isArray(val) ? val : [val];
    for (const p of parts) {
      if (p !== null && p !== undefined && String(p) !== '') {
        searchParams.append(key, String(p));
      }
    }
  }
  const q = searchParams.toString();
  if (q) target.search = q;
  return target.toString();
}

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
      composition?: string;
      parentWorkflowId?: string;
      parentRunId?: string;
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
            composition: { type: 'string' },
            parentWorkflowId: { type: 'string' },
            parentRunId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const client = await getTemporalClient();
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
    Querystring: { runId?: string };
  }>(
    '/runs/:workflowId/spans',
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
        const { querySpans } = await import('../span-buffer');
        
        const otlpBase = process.env.DURION_OTLP_QUERY_URL?.trim();
        if (otlpBase) {
          let targetUrl: string;
          try {
            targetUrl = buildOtlpSpansProxyUrl(otlpBase, request.params.workflowId, request.query as Record<string, unknown>);
          } catch (err) {
            request.log.error(err, 'Invalid DURION_OTLP_QUERY_URL');
            return reply.status(500).send({
              error: 'Server misconfiguration',
              message: 'DURION_OTLP_QUERY_URL is not a valid base URL',
            });
          }

          const upstream = await fetch(targetUrl, {
            headers: { accept: 'application/json' },
          });

          if (!upstream.ok) {
            const bodyText = await upstream.text();
            request.log.warn(
              { status: upstream.status, url: targetUrl, body: bodyText.slice(0, 500) },
              'OTLP spans query proxy upstream error',
            );
            let message = bodyText.trim() || upstream.statusText || 'Upstream request failed';
            try {
              const j = JSON.parse(bodyText) as { error?: string; message?: string };
              if (typeof j?.message === 'string') message = j.message;
              else if (typeof j?.error === 'string') message = j.error;
            } catch {
              /* keep message from text */
            }
            return reply.status(upstream.status).send({
              error: 'OTLP query backend error',
              message,
            });
          }

          const ct = upstream.headers.get('content-type') ?? '';
          if (ct.includes('application/json')) {
            try {
              const data = (await upstream.json()) as unknown;
              return reply.send(data);
            } catch (parseErr) {
              request.log.error(parseErr, 'OTLP spans query proxy: invalid JSON from upstream');
              return reply.status(502).send({
                error: 'Bad gateway',
                message: 'Upstream returned invalid JSON',
              });
            }
          }

          const text = await upstream.text();
          return reply.type(ct || 'text/plain').send(text);
        }

        // Default: return from local in-memory span buffer
        const runId = request.query.runId?.trim() || undefined;
        const spans = querySpans(request.params.workflowId, runId);
        return reply.send(spans);
      } catch (err) {
        request.log.error(err);
        return reply.status(500).send({
          error: 'Internal server error fetching spans',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  fastify.get<{
    Params: { workflowId: string };
    Querystring: { runId?: string };
  }>(
    '/runs/:workflowId/history',
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
        const runId = request.query.runId?.trim() || undefined;
        const history = await client.fetchWorkflowHistory(request.params.workflowId, runId);
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

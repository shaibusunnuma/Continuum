import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';

function pathWithoutQuery(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function isTokenStreamPath(path: string): boolean {
  return path.includes('/token-stream') && path.endsWith('/token-stream');
}

/**
 * Optional auth for `/v0/*` only. See docs/gateway-api-v0.md.
 */
export async function gatewayV0AuthPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const expected = config.AI_RUNTIME_GATEWAY_TOKEN;
  if (expected == null || expected === '') {
    return;
  }

  const authHeader = request.headers.authorization;
  const bearer =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

  const path = pathWithoutQuery(request.url);
  const forSse = isTokenStreamPath(path);

  let queryToken = '';
  if (typeof request.query === 'object' && request.query !== null && 'access_token' in request.query) {
    const q = (request.query as { access_token?: string }).access_token;
    queryToken = typeof q === 'string' ? q : '';
  }

  const ok = forSse
    ? bearer === expected || queryToken === expected
    : bearer === expected;

  if (!ok) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or missing gateway token',
    });
  }
}

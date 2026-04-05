import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

/**
 * Directory containing Vite `vite build` output (`index.html` + `assets/`), copied to
 * `packages/cli/studio-dist` at publish time. Resolved from compiled `dist/gateway/*.js`.
 */
export function resolveBundledStudioDir(): string | null {
  // Compiled to dist/gateway/*.js — studio-dist is a sibling of dist/ at package root.
  const candidates = [path.join(__dirname, '..', '..', 'studio-dist')];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

/**
 * Serve bundled Durion Studio SPA from the same origin as the gateway (`/v0`, `/v1`).
 */
export async function registerBundledStudio(fastify: FastifyInstance, studioRoot: string): Promise<void> {
  await fastify.register(fastifyStatic, {
    root: studioRoot,
    prefix: '/',
    decorateReply: true,
  });

  const indexPath = path.join(studioRoot, 'index.html');

  fastify.setNotFoundHandler((request, reply) => {
    const method = request.method;
    if (method !== 'GET' && method !== 'HEAD') {
      return reply.code(404).send({ error: 'Not Found' });
    }
    const urlPath = request.url.split('?')[0] ?? '';
    if (urlPath.startsWith('/v0') || urlPath.startsWith('/v1')) {
      return reply.code(404).send({ error: 'Not Found' });
    }
    return reply.type('text/html').send(fs.readFileSync(indexPath, 'utf-8'));
  });
}

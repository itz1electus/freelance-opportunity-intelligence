import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { apiError } from './api/errors.ts';
import { apiRoutes } from './api/routes.ts';
import { serveWeb } from './api/static.ts';
import type { AppDeps, AppEnv } from './context.ts';
import { fetchMetadataGuard, hostGuard, mutationGuard, securityHeaders, sessionGuard } from './security/guards.ts';

/**
 * Composes the HTTP application. Guard order matters: every request is checked
 * for host, site and origin before any handler or session lookup runs, so a
 * refused request has no side effects (P1-04).
 */
export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('requestId', randomUUID());
    c.set('sessionHash', null);
    const started = deps.clock();
    await next();
    c.header('X-Request-Id', c.get('requestId'));
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/api/')) {
      deps.logger.info('http.request', {
        requestId: c.get('requestId'),
        method: c.req.method,
        path,
        status: c.res.status,
        durationMs: deps.clock() - started,
      });
    }
  });
  app.use('*', securityHeaders());
  app.use('*', hostGuard(deps));
  app.use('/api/*', fetchMetadataGuard());
  app.use('/api/*', mutationGuard(deps));
  app.use('/api/v1/*', sessionGuard(deps));

  app.route('/api/v1', apiRoutes(deps));
  app.all('/api/*', (c) => apiError(c, 404, 'NOT_FOUND', 'Unknown API route.'));
  app.get('*', serveWeb(deps));

  app.onError((error, c) => {
    deps.logger.error('http.unhandled_error', { requestId: c.get('requestId'), error });
    return apiError(c, 500, 'INTERNAL_ERROR', 'Something went wrong. The request ID is in the server log.');
  });
  return app;
}

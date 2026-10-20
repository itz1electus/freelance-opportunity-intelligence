import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Context } from 'hono';
import type { AppDeps, AppEnv } from '../context.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const NOT_BUILT = `<!doctype html><meta charset="utf-8"><title>FOI</title>
<p>The FOI web interface has not been built yet. Run <code>npm run build</code>, then <code>npm start</code>.</p>`;

/**
 * Serves the built single-page app. Only files inside the dist folder with a
 * known extension are served; any other path gets index.html so client-side
 * routes work.
 */
export function serveWeb(deps: AppDeps) {
  return (c: Context<AppEnv>): Response => {
    const root = deps.webDistDir ? resolve(deps.webDistDir) : null;
    if (!root || !existsSync(join(root, 'index.html'))) return c.html(NOT_BUILT, 503);
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text('Bad request', 400);
    }
    if (pathname.includes('\0')) return c.text('Bad request', 400);
    const candidate = normalize(join(root, pathname));
    const inside = candidate === root || candidate.startsWith(root + sep);
    const type = CONTENT_TYPES[extname(candidate).toLowerCase()];
    if (inside && type && existsSync(candidate) && statSync(candidate).isFile()) {
      const immutable = pathname.startsWith('/assets/');
      return c.body(readFileSync(candidate), 200, {
        'content-type': type,
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
    }
    if (extname(pathname) !== '') return c.text('Not found', 404);
    return c.body(readFileSync(join(root, 'index.html')), 200, {
      'content-type': CONTENT_TYPES['.html']!,
      'cache-control': 'no-cache',
    });
  };
}

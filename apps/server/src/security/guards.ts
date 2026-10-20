import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@foi/domain';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { apiError } from '../api/errors.ts';
import { apiHost, apiOrigin, type AppDeps, type AppEnv } from '../context.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD']);
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Exact Host allowlist against DNS rebinding (ADR-011). `localhost` navigations
 * are redirected to the canonical 127.0.0.1 host, because the two are separate
 * cookie jars.
 */
export function hostGuard(deps: AppDeps): MiddlewareHandler<AppEnv> {
  const expected = apiHost(deps);
  const localhostAlias = `localhost:${deps.config.port}`;
  return async (c, next) => {
    const host = c.req.header('host');
    if (host === expected) return next();
    const url = new URL(c.req.url);
    if (host === localhostAlias && SAFE_METHODS.has(c.req.method) && !url.pathname.startsWith('/api/')) {
      return c.redirect(`${apiOrigin(deps)}${url.pathname}${url.search}`, 308);
    }
    return apiError(c, 403, 'HOST_FORBIDDEN', 'Requests must use the address FOI listens on.', {
      expectedHost: expected,
    });
  };
}

/**
 * Fetch Metadata check (ADR-011). Pages on other sites and on other localhost
 * ports ("same-site") never reach the API. Non-browser clients send no header.
 */
export function fetchMetadataGuard(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const site = c.req.header('sec-fetch-site');
    if (site === 'cross-site' || site === 'same-site') {
      return apiError(c, 403, 'ORIGIN_FORBIDDEN', 'Requests from other sites or local ports are refused.');
    }
    return next();
  };
}

/**
 * Every state-changing request needs the exact origin and the custom header,
 * which a cross-origin page cannot send without a preflight FOI never approves.
 */
export function mutationGuard(deps: AppDeps): MiddlewareHandler<AppEnv> {
  const expectedOrigin = apiOrigin(deps);
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    if (c.req.header('origin') !== expectedOrigin) {
      return apiError(c, 403, 'ORIGIN_FORBIDDEN', 'State-changing requests must come from FOI itself.');
    }
    if (c.req.header(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      return apiError(c, 403, 'CSRF_HEADER_REQUIRED', `Missing the ${CSRF_HEADER} header.`);
    }
    const length = Number(c.req.header('content-length') ?? '0');
    if (length > MAX_BODY_BYTES) return apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    const hasBody = length > 0 || c.req.header('transfer-encoding') !== undefined;
    if (hasBody && !(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return apiError(c, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Request bodies must be JSON.');
    }
    return next();
  };
}

/** Routes reachable without a session (ADR-011). Everything else requires one, reads included. */
export const PUBLIC_ROUTES = new Set([
  'GET /api/v1/health',
  'GET /api/v1/setup/status',
  'POST /api/v1/auth/launch',
  'POST /api/v1/auth/launch-tokens',
]);

export function sessionGuard(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = deps.sessions.verify(getCookie(c, deps.cookieName));
    c.set('sessionHash', session?.idHash ?? null);
    const key = `${c.req.method} ${new URL(c.req.url).pathname}`;
    if (!session && !PUBLIC_ROUTES.has(key)) {
      return apiError(c, 401, 'AUTH_REQUIRED', 'Sign in again: run `npm run open` in the FOI folder.');
    }
    return next();
  };
}

/** Strict browser security headers on every response (SEC-08). */
export function securityHeaders(): MiddlewareHandler<AppEnv> {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return async (c, next) => {
    await next();
    c.header('Content-Security-Policy', csp);
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
    c.header('Cross-Origin-Resource-Policy', 'same-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (new URL(c.req.url).pathname.startsWith('/api/')) c.header('Cache-Control', 'no-store');
  };
}

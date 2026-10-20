import type { MiddlewareHandler } from 'hono';
import { apiError } from '../api/errors.ts';
import type { AppDeps, AppEnv } from '../context.ts';
import { sha256 } from '../security/tokens.ts';

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * `Idempotency-Key` support (spec §4.3): an identical replay returns the stored
 * response; the same key with a different request returns 409. Responses with
 * a 5xx status are not stored, so a failed request can be retried.
 */
export function idempotency(deps: AppDeps): MiddlewareHandler<AppEnv> {
  const sqlite = deps.database.sqlite;
  return async (c, next) => {
    const key = c.req.header('idempotency-key');
    if (key === undefined) return next();
    if (!KEY_PATTERN.test(key)) {
      return apiError(c, 422, 'VALIDATION_ERROR', 'Idempotency-Key must be 8–128 letters, digits, "-" or "_".');
    }
    const path = new URL(c.req.url).pathname;
    const body = await c.req.raw.clone().text();
    const requestHash = sha256(`${c.req.method}\n${path}\n${body}`);
    const now = deps.clock();
    sqlite.prepare('DELETE FROM idempotency_keys WHERE expires_at_ms <= ?').run(now);
    const stored = sqlite
      .prepare('SELECT request_hash, status_code, response_json FROM idempotency_keys WHERE key = ?')
      .get(key) as { request_hash: string; status_code: number; response_json: string } | undefined;
    if (stored) {
      if (stored.request_hash !== requestHash) {
        return apiError(c, 409, 'IDEMPOTENCY_CONFLICT', 'This Idempotency-Key was already used for a different request.');
      }
      return new Response(stored.response_json, {
        status: stored.status_code,
        headers: { 'content-type': 'application/json', 'idempotent-replay': 'true' },
      });
    }
    await next();
    if (c.res.status < 500) {
      const text = await c.res.clone().text();
      sqlite
        .prepare(
          `INSERT OR IGNORE INTO idempotency_keys
             (key, method, path, request_hash, status_code, response_json, created_at_ms, expires_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(key, c.req.method, path, requestHash, c.res.status, text, now, now + TTL_MS);
    }
  };
}

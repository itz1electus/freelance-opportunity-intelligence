import { DEFAULT_BUDGET, FixtureEchoPayloadSchema, money } from '@foi/domain';
import { listSources } from '@foi/connectors';
import { detectRiskyLocation } from '@foi/infra';
import { Hono, type Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { listAudit, recordAudit } from '../application/audit.ts';
import { idempotency } from '../application/idempotency.ts';
import type { AppDeps, AppEnv } from '../context.ts';
import { safeEqual } from '../security/tokens.ts';
import { apiError } from './errors.ts';
import { readJson } from './json.ts';

const LaunchBodySchema = z.object({ token: z.string().min(20).max(200) }).strict();

export function apiRoutes(deps: AppDeps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  const sqlite = deps.database.sqlite;
  const audit = (c: Context<AppEnv>, action: string, details?: Record<string, string | number | boolean | null>) =>
    recordAudit(sqlite, { action, details, requestId: c.get('requestId') }, deps.clock());

  const issueSession = (c: Context<AppEnv>) => {
    const { cookieValue, record } = deps.sessions.create(c.req.header('user-agent') ?? null);
    setCookie(c, deps.cookieName, cookieValue, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/api',
      expires: new Date(record.expiresAtMs),
    });
    return record;
  };

  api.get('/health', (c) => c.json({ status: 'ok' }));

  api.get('/setup/status', (c) => c.json({ serverReady: true, partnersProvisioned: deps.profiles.provisioned() }));

  api.post('/auth/launch', async (c) => {
    const body = await readJson(c, LaunchBodySchema);
    if (!body.ok) return body.response;
    if (!deps.launchTokens.consume(body.data.token)) {
      audit(c, 'session.launch_rejected');
      return apiError(c, 401, 'LAUNCH_TOKEN_INVALID', 'This sign-in link has expired or was already used. Run `npm run open` for a new one.');
    }
    const record = issueSession(c);
    audit(c, 'session.started');
    return c.json({ authenticated: true, expiresAt: new Date(record.expiresAtMs).toISOString() });
  });

  /** Used by `npm run open`; proves local file access through a 0600 key file. */
  api.post('/auth/launch-tokens', (c) => {
    const presented = c.req.header('x-foi-local-key');
    if (!deps.localKey || !presented || !safeEqual(presented, deps.localKey)) {
      return apiError(c, 401, 'AUTH_REQUIRED', 'A valid local key is required.');
    }
    const token = deps.launchTokens.mint();
    return c.json({ launchUrl: `${deps.webBaseUrl}/launch#t=${token}` }, 201);
  });

  api.get('/auth/session', (c) => {
    const row = sqlite.prepare('SELECT expires_at_ms FROM sessions WHERE id_hash = ?').get(c.get('sessionHash')) as
      | { expires_at_ms: number }
      | undefined;
    return c.json({ authenticated: true, expiresAt: row ? new Date(row.expires_at_ms).toISOString() : null });
  });

  api.delete('/auth/session', (c) => {
    const hash = c.get('sessionHash');
    if (hash) deps.sessions.revoke(hash);
    deleteCookie(c, deps.cookieName, { path: '/api' });
    audit(c, 'session.ended');
    return c.body(null, 204);
  });

  api.delete('/auth/sessions', (c) => {
    const count = deps.sessions.revokeAll();
    deleteCookie(c, deps.cookieName, { path: '/api' });
    audit(c, 'session.signed_out_all', { count });
    return c.body(null, 204);
  });

  api.get('/system', (c) =>
    c.json({
      version: deps.version,
      fixtureMode: deps.config.fixtureMode,
      warnings: [...deps.config.warnings, ...detectRiskyLocation(deps.config.dataDir)],
      dataLocation: 'data/ inside the project folder',
      partnersProvisioned: deps.profiles.provisioned(),
      shared: deps.shared.status(),
      budget: {
        monthlyHardCap: DEFAULT_BUDGET.monthlyHardCap,
        // Phase 1 makes no metered calls; the usage ledger arrives with the first paid integration.
        spentThisMonth: money('USD', '0'),
      },
    }),
  );

  api.get('/sources', (c) => c.json({ items: listSources({ fixtureMode: deps.config.fixtureMode }) }));

  api.get('/audit-events', (c) => {
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? '50') || 50));
    return c.json({ items: listAudit(sqlite, limit) });
  });

  /** Demo-only queue exercise (P1-05, P1-07); refused outside fixture mode. */
  api.post('/fixture/jobs', idempotency(deps), async (c) => {
    if (!deps.config.fixtureMode) {
      return apiError(c, 409, 'FIXTURE_MODE_ONLY', 'Demo jobs are available only in demo mode.');
    }
    const body = await readJson(c, FixtureEchoPayloadSchema);
    if (!body.ok) return body.response;
    const { job, created } = deps.queue.enqueue({
      jobType: 'fixture_echo',
      payload: body.data,
      dedupeKey: `fixture_echo:${c.get('requestId')}`,
    });
    if (created) audit(c, 'job.enqueued', { jobType: 'fixture_echo' });
    return c.json({ job, statusUrl: `/api/v1/jobs/${job.id}` }, 202);
  });

  api.get('/jobs/:id', (c) => {
    const job = deps.queue.get(c.req.param('id'));
    return job ? c.json({ job }) : apiError(c, 404, 'NOT_FOUND', 'No job with that ID.');
  });

  api.post('/jobs/:id/cancel', (c) => {
    const job = deps.queue.requestCancel(c.req.param('id'));
    if (!job) return apiError(c, 404, 'NOT_FOUND', 'No job with that ID.');
    audit(c, 'job.cancel_requested', { status: job.status });
    return c.json({ job }, 202);
  });

  api.notFound((c) => apiError(c, 404, 'NOT_FOUND', 'Unknown API route.'));
  return api;
}

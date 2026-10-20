import { afterEach, describe, expect, it } from 'vitest';
import { makeTestServer } from './helpers.ts';

let server: ReturnType<typeof makeTestServer>;
afterEach(() => server?.close());

describe('Phase 1 API behaviour', () => {
  it('P1-14: idempotency keys replay identical requests and reject different ones', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    const headers = { 'idempotency-key': 'demo-key-0001' };
    const first = await server.req('/api/v1/fixture/jobs', { method: 'POST', body: { message: 'one' }, cookie, headers });
    const replay = await server.req('/api/v1/fixture/jobs', { method: 'POST', body: { message: 'one' }, cookie, headers });
    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(replay.headers.get('idempotent-replay')).toBe('true');
    expect(((await replay.json()) as { job: { id: string } }).job.id).toBe(
      ((await first.json()) as { job: { id: string } }).job.id,
    );
    expect(server.countJobs()).toBe(1);

    const conflict = await server.req('/api/v1/fixture/jobs', { method: 'POST', body: { message: 'two' }, cookie, headers });
    expect(conflict.status).toBe(409);
    expect(((await conflict.json()) as { error: { code: string } }).error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(server.countJobs()).toBe(1);

    const malformed = await server.req('/api/v1/fixture/jobs', {
      method: 'POST',
      body: { message: 'x' },
      cookie,
      headers: { 'idempotency-key': 'bad key!' },
    });
    expect(malformed.status).toBe(422);
  });

  it('P1-07: without credentials only the demo source is enabled', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    const { items } = (await (await server.req('/api/v1/sources', { cookie })).json()) as {
      items: Array<{ id: string; enabled: boolean; status: string }>;
    };
    expect(items.filter((s) => s.enabled).map((s) => s.id)).toEqual(['fixture']);
    expect(items.filter((s) => !s.enabled).every((s) => s.status === 'not_configured')).toBe(true);
  });

  it('refuses demo jobs when demo mode is off', async () => {
    server = makeTestServer({ fixtureMode: false });
    const cookie = await server.login();
    const res = await server.req('/api/v1/fixture/jobs', { method: 'POST', body: { message: 'x' }, cookie });
    expect(res.status).toBe(409);
    expect(server.countJobs()).toBe(0);
  });

  it('runs a demo job end to end through the worker and allows cancelling', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    const created = (await (
      await server.req('/api/v1/fixture/jobs', { method: 'POST', body: { message: 'ping' }, cookie })
    ).json()) as { job: { id: string }; statusUrl: string };
    await server.runtime.worker.runOnce();
    const status = (await (await server.req(created.statusUrl, { cookie })).json()) as {
      job: { status: string; result: unknown };
    };
    expect(status.job).toMatchObject({ status: 'succeeded', result: { echo: 'ping', attempt: 1 } });

    const other = (await (
      await server.req('/api/v1/fixture/jobs', { method: 'POST', body: { message: 'later' }, cookie })
    ).json()) as { job: { id: string } };
    const cancelled = await server.req(`/api/v1/jobs/${other.job.id}/cancel`, { method: 'POST', cookie });
    expect(cancelled.status).toBe(202);
    expect(((await cancelled.json()) as { job: { status: string } }).job.status).toBe('cancelled');
    expect((await server.req('/api/v1/jobs/does-not-exist', { cookie })).status).toBe(404);
  });

  it('validates demo job payloads', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    const res = await server.req('/api/v1/fixture/jobs', { method: 'POST', body: { message: '', delayMs: 99999 }, cookie });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; details: { issues: unknown[] } } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('reports system state without secrets', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    const res = await server.req('/api/v1/system', { cookie });
    const text = await res.text();
    const body = JSON.parse(text) as { fixtureMode: boolean; budget: { monthlyHardCap: { minorUnits: string } } };
    expect(body.fixtureMode).toBe(true);
    expect(body.budget.monthlyHardCap.minorUnits).toBe('3000');
    expect(text).not.toContain(server.runtime.deps.localKey!);
    expect(text).not.toContain(server.runtime.deps.config.dataDir);
  });

  it('returns the error envelope for unknown API routes', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    const res = await server.req('/api/v1/nope', { cookie });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });
});

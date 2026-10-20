import { LAUNCH_TOKEN_TTL_MS, SESSION_IDLE_TIMEOUT_MS } from '@foi/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTestServer } from './helpers.ts';

let server: ReturnType<typeof makeTestServer>;
afterEach(() => server?.close());

const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe('ADR-012 launch-token sign-in', () => {
  it('issues a hardened session cookie and stores only its hash', async () => {
    server = makeTestServer();
    const token = server.runtime.deps.launchTokens.mint();
    const res = await server.req('/api/v1/auth/launch', { method: 'POST', body: { token } });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^foi_sid_[0-9a-f]{12}=/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/api');
    const value = setCookie.split(';')[0]!.split('=')[1]!;
    const stored = server.runtime.deps.database.sqlite.prepare('SELECT id_hash FROM sessions').all() as Array<{ id_hash: string }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id_hash).not.toBe(value);
    expect(stored[0]!.id_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('P1-10: a launch token works once and expires after 2 minutes', async () => {
    server = makeTestServer();
    const token = server.runtime.deps.launchTokens.mint();
    expect((await server.req('/api/v1/auth/launch', { method: 'POST', body: { token } })).status).toBe(200);
    const reused = await server.req('/api/v1/auth/launch', { method: 'POST', body: { token } });
    expect(reused.status).toBe(401);
    expect(await code(reused)).toBe('LAUNCH_TOKEN_INVALID');

    const late = server.runtime.deps.launchTokens.mint();
    server.advance(LAUNCH_TOKEN_TTL_MS + 1);
    const expired = await server.req('/api/v1/auth/launch', { method: 'POST', body: { token: late } });
    expect(expired.status).toBe(401);
    expect(await code(expired)).toBe('LAUNCH_TOKEN_INVALID');
  });

  it('rejects made-up tokens and malformed bodies', async () => {
    server = makeTestServer();
    expect((await server.req('/api/v1/auth/launch', { method: 'POST', body: { token: 'x'.repeat(43) } })).status).toBe(401);
    expect((await server.req('/api/v1/auth/launch', { method: 'POST', body: { token: 1 } })).status).toBe(422);
    expect(
      (await server.req('/api/v1/auth/launch', { method: 'POST', rawBody: '{', headers: { 'content-type': 'application/json' } })).status,
    ).toBe(400);
  });

  it('ends a session after the idle timeout', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    expect((await server.req('/api/v1/system', { cookie })).status).toBe(200);
    server.advance(SESSION_IDLE_TIMEOUT_MS + 1);
    expect((await server.req('/api/v1/system', { cookie })).status).toBe(401);
  });

  it('P1-15: sign out all sessions revokes every session and is audited', async () => {
    server = makeTestServer();
    const first = await server.login();
    const second = await server.login();
    const res = await server.req('/api/v1/auth/sessions', { method: 'DELETE', cookie: first });
    expect(res.status).toBe(204);
    expect((await server.req('/api/v1/system', { cookie: first })).status).toBe(401);
    expect((await server.req('/api/v1/system', { cookie: second })).status).toBe(401);
    const third = await server.login();
    const audit = (await (await server.req('/api/v1/audit-events', { cookie: third })).json()) as {
      items: Array<{ action: string; details: Record<string, unknown> }>;
    };
    const signOut = audit.items.find((e) => e.action === 'session.signed_out_all');
    expect(signOut?.details).toEqual({ count: 2 });
  });

  it('signs out the current session only', async () => {
    server = makeTestServer();
    const a = await server.login();
    const b = await server.login();
    expect((await server.req('/api/v1/auth/session', { method: 'DELETE', cookie: a })).status).toBe(204);
    expect((await server.req('/api/v1/system', { cookie: a })).status).toBe(401);
    expect((await server.req('/api/v1/system', { cookie: b })).status).toBe(200);
  });

  it('lets `npm run open` mint a link only with the local key', async () => {
    server = makeTestServer();
    const wrong = await server.req('/api/v1/auth/launch-tokens', { method: 'POST', headers: { 'x-foi-local-key': 'nope' } });
    expect(wrong.status).toBe(401);
    const right = await server.req('/api/v1/auth/launch-tokens', {
      method: 'POST',
      headers: { 'x-foi-local-key': server.runtime.deps.localKey! },
    });
    expect(right.status).toBe(201);
    const { launchUrl } = (await right.json()) as { launchUrl: string };
    expect(launchUrl).toMatch(/^http:\/\/127\.0\.0\.1:4311\/launch#t=/);
    const token = launchUrl.split('#t=')[1]!;
    expect((await server.req('/api/v1/auth/launch', { method: 'POST', body: { token } })).status).toBe(200);
  });
});

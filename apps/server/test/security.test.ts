import { afterEach, describe, expect, it } from 'vitest';
import { makeTestServer } from './helpers.ts';

let server: ReturnType<typeof makeTestServer>;
afterEach(() => server?.close());

const job = { message: 'hello' };

describe('ADR-011 request integrity', () => {
  it('serves health without a session, and nothing else', async () => {
    server = makeTestServer();
    expect((await server.req('/api/v1/health')).status).toBe(200);
    const setup = await server.req('/api/v1/setup/status');
    expect(setup.status).toBe(200);
    expect(await setup.json()).toEqual({ serverReady: true, partnersProvisioned: false });
  });

  it('P1-09: reads require a session', async () => {
    server = makeTestServer();
    for (const path of ['/api/v1/system', '/api/v1/sources', '/api/v1/audit-events', '/api/v1/auth/session']) {
      const res = await server.req(path);
      expect(res.status, path).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('AUTH_REQUIRED');
    }
  });

  it('P1-03: only an authenticated operator can mutate state', async () => {
    server = makeTestServer();
    const anonymous = await server.req('/api/v1/fixture/jobs', { method: 'POST', body: job });
    expect(anonymous.status).toBe(401);
    expect(server.countJobs()).toBe(0);
    const cookie = await server.login();
    const signedIn = await server.req('/api/v1/fixture/jobs', { method: 'POST', body: job, cookie });
    expect(signedIn.status).toBe(202);
    expect(server.countJobs()).toBe(1);
  });

  it('P1-04: a foreign Host is refused before any handler runs', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    for (const host of ['evil.example:4311', '127.0.0.1:9999', '0.0.0.0:4311', '[::1]:4311']) {
      const res = await server.req('/api/v1/fixture/jobs', { method: 'POST', body: job, cookie, headers: { host } });
      expect(res.status, host).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('HOST_FORBIDDEN');
    }
    expect(server.countJobs()).toBe(0);
  });

  it('P1-04: cross-origin, missing-header and null-origin mutations have no side effect', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    const attempts: Array<Record<string, string>> = [
      { origin: 'https://evil.example', 'x-foi-request': '1' },
      { origin: 'null', 'x-foi-request': '1' },
      { origin: 'http://127.0.0.1:4311' },
      { 'x-foi-request': '1' },
    ];
    for (const headers of attempts) {
      const res = await server.req('/api/v1/fixture/jobs', { method: 'POST', body: job, cookie, headers, asFoiPage: false });
      expect(res.status, JSON.stringify(headers)).toBe(403);
    }
    expect(server.countJobs()).toBe(0);
  });

  it('P1-08: another localhost port is refused even with a valid FOI cookie', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    const fromDevServer = await server.req('/api/v1/fixture/jobs', {
      method: 'POST',
      body: job,
      cookie,
      asFoiPage: false,
      headers: { origin: 'http://localhost:5173', 'x-foi-request': '1', 'sec-fetch-site': 'same-site' },
    });
    expect(fromDevServer.status).toBe(403);
    const sameSiteRead = await server.req('/api/v1/system', { cookie, headers: { 'sec-fetch-site': 'same-site' } });
    expect(sameSiteRead.status).toBe(403);
    const crossSiteRead = await server.req('/api/v1/system', { cookie, headers: { 'sec-fetch-site': 'cross-site' } });
    expect(crossSiteRead.status).toBe(403);
    expect(server.countJobs()).toBe(0);
  });

  it('never approves a CORS preflight', async () => {
    server = makeTestServer();
    const res = await server.req('/api/v1/fixture/jobs', {
      method: 'OPTIONS',
      asFoiPage: false,
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.status).toBe(403);
  });

  it('redirects localhost page loads to the canonical 127.0.0.1 address', async () => {
    server = makeTestServer();
    const res = await server.req('/opportunities', { headers: { host: 'localhost:4311' } });
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('http://127.0.0.1:4311/opportunities');
    const api = await server.req('/api/v1/health', { headers: { host: 'localhost:4311' } });
    expect(api.status).toBe(403);
  });

  it('rejects non-JSON and oversized bodies', async () => {
    server = makeTestServer();
    const cookie = await server.login();
    const form = await server.req('/api/v1/fixture/jobs', {
      method: 'POST',
      cookie,
      rawBody: 'message=hello',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(form.status).toBe(415);
    const huge = await server.req('/api/v1/fixture/jobs', { method: 'POST', cookie, body: { message: 'x'.repeat(70_000) } });
    expect(huge.status).toBe(413);
  });

  it('SEC-08: sends strict security headers on pages and API responses', async () => {
    server = makeTestServer();
    for (const path of ['/', '/api/v1/health']) {
      const res = await server.req(path);
      expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    }
    expect((await server.req('/api/v1/health')).headers.get('cache-control')).toBe('no-store');
  });

  it('never serves files outside the web build', async () => {
    server = makeTestServer();
    for (const path of ['/%2e%2e/%2e%2e/package.json', '/..%2F..%2Fpackage.json', '/assets/../../package.json']) {
      const res = await server.req(path);
      const text = await res.text();
      expect(text, path).not.toContain('"workspaces"');
    }
    const asset = await server.req('/assets/app.js');
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('text/javascript');
  });

  it('serves the single-page app for client-side routes', async () => {
    server = makeTestServer();
    const res = await server.req('/settings');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('FOI test shell');
  });
});

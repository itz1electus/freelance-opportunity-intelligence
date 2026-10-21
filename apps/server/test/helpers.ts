import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepoRoot, silentLogger, type FoiConfig } from '@foi/infra';
import { createApp } from '../src/app.ts';
import { createRuntime } from '../src/runtime.ts';

export const PORT = 4311;
export const ORIGIN = `http://127.0.0.1:${PORT}`;
export const HOST = `127.0.0.1:${PORT}`;

export interface RequestOptions {
  method?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  cookie?: string;
  /** Adds the exact Origin and X-FOI-Request headers a real FOI page sends. */
  asFoiPage?: boolean;
}

export function makeTestServer(options: { fixtureMode?: boolean; port?: number; dataDir?: string } = {}) {
  const repoRoot = findRepoRoot();
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'foi-server-'));
  const port = options.port ?? PORT;
  const config: FoiConfig = {
    repoRoot,
    host: '127.0.0.1',
    port,
    logLevel: 'error',
    fixtureMode: options.fixtureMode ?? true,
    dataDir,
    warnings: [],
  };
  let now = Date.UTC(2026, 9, 20, 12, 0, 0);
  const runtime = createRuntime({ config, logger: silentLogger, clock: () => now, startWorker: false });

  // A tiny stand-in for the built web app, so tests never depend on `npm run build`.
  const dist = mkdtempSync(join(tmpdir(), 'foi-dist-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>FOI test shell</title><div id="root"></div>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("foi")');
  runtime.deps.webDistDir = dist;

  const app = createApp(runtime.deps);
  const origin = `http://127.0.0.1:${port}`;

  async function req(path: string, o: RequestOptions = {}): Promise<Response> {
    const method = o.method ?? 'GET';
    const headers: Record<string, string> = { host: `127.0.0.1:${port}`, ...o.headers };
    if (o.asFoiPage !== false && method !== 'GET' && method !== 'HEAD') {
      headers.origin ??= origin;
      headers['x-foi-request'] ??= '1';
    }
    if (o.cookie) headers.cookie = o.cookie;
    let body: string | undefined = o.rawBody;
    if (o.body !== undefined) {
      body = JSON.stringify(o.body);
      headers['content-type'] ??= 'application/json';
    }
    if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body));
    return app.request(`${origin}${path}`, { method, headers, body });
  }

  /** Performs the real launch-token sign-in and returns the Cookie header to reuse. */
  async function login(): Promise<string> {
    const token = runtime.deps.launchTokens.mint();
    const res = await req('/api/v1/auth/launch', { method: 'POST', body: { token } });
    if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
    const setCookie = res.headers.get('set-cookie') ?? '';
    return setCookie.split(';')[0]!;
  }

  const countJobs = () =>
    (runtime.deps.database.sqlite.prepare('SELECT COUNT(*) AS n FROM background_jobs').get() as { n: number }).n;

  return {
    dataDir,
    runtime,
    app,
    req,
    login,
    countJobs,
    advance: (ms: number) => {
      now += ms;
    },
    close: () => runtime.deps.database.close(),
  };
}

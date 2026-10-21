import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import {
  createLogger,
  dataPaths,
  detectRiskyLocation,
  ensureDataDirs,
  openDatabase,
  type FoiConfig,
  type Logger,
} from '@foi/infra';
import type Database from 'better-sqlite3';
import { createApp } from './app.ts';
import { ProfileService } from './application/profiles/service.ts';
import { SharedSync } from './application/shared/sync.ts';
import type { AppDeps, Clock } from './context.ts';
import { LaunchTokens } from './security/launch-tokens.ts';
import { SessionService } from './security/sessions.ts';
import { defaultHandlers } from './worker/handlers.ts';
import { JobQueue } from './worker/queue.ts';
import { Worker } from './worker/worker.ts';

export interface RuntimeOptions {
  config: FoiConfig;
  logger?: Logger;
  clock?: Clock;
  webBaseUrl?: string;
  /** Set false in tests that drive the worker by hand. */
  startWorker?: boolean;
}

export interface Runtime {
  deps: AppDeps;
  worker: Worker;
  listen(): Promise<{ url: string; close(): Promise<void> }>;
  shutdown(): Promise<void>;
}

/** Install-unique cookie name, so FOI never collides with another local app's cookie (SEC-01). */
function installId(sqlite: Database.Database): string {
  const row = sqlite.prepare("SELECT value_json FROM app_settings WHERE key = 'install.id'").get() as
    | { value_json: string }
    | undefined;
  if (row) return JSON.parse(row.value_json) as string;
  const id = randomBytes(6).toString('hex');
  sqlite
    .prepare("INSERT INTO app_settings (key, value_json, version, updated_at_ms) VALUES ('install.id', ?, 1, ?)")
    .run(JSON.stringify(id), Date.now());
  return id;
}

function readVersion(repoRoot: string): string {
  try {
    return (JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

export function createRuntime(options: RuntimeOptions): Runtime {
  const { config } = options;
  const paths = dataPaths(config.dataDir);
  ensureDataDirs(paths);
  const logger =
    options.logger ?? createLogger({ level: config.logLevel, file: join(paths.logs, 'foi.log') });
  for (const warning of [...config.warnings, ...detectRiskyLocation(paths.root)]) logger.warn('startup.warning', { warning });

  const clock = options.clock ?? Date.now;
  const database = openDatabase(paths.database);
  for (const migration of database.migrations.applied) logger.info('db.migration_applied', { migration });

  const localKey = randomBytes(32).toString('hex');
  const queue = new JobQueue(database.sqlite, clock);
  const profiles = new ProfileService(database.sqlite, clock);
  const shared = new SharedSync(database.sqlite, paths.shared, profiles, logger, clock, paths.backups);
  profiles.setHooks(shared);
  shared.startup();
  const webDist = join(config.repoRoot, 'apps', 'web', 'dist');
  const deps: AppDeps = {
    config,
    database,
    logger,
    clock,
    sessions: new SessionService(database.sqlite, clock),
    launchTokens: new LaunchTokens(clock),
    queue,
    profiles,
    shared,
    cookieName: `foi_sid_${installId(database.sqlite)}`,
    localKey,
    webDistDir: webDist,
    webBaseUrl: options.webBaseUrl ?? `http://${config.host}:${config.port}`,
    version: readVersion(config.repoRoot),
  };
  const worker = new Worker(queue, defaultHandlers, logger);
  const app = createApp(deps);
  const runtimeFile = join(paths.runtime, 'server.json');

  let server: ReturnType<typeof serve> | null = null;

  return {
    deps,
    worker,
    listen: () =>
      new Promise((resolve, reject) => {
        server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
          // The local key lets `npm run open` mint a sign-in link; readable by this macOS user only.
          writeFileSync(runtimeFile, JSON.stringify({ port: info.port, pid: process.pid, localKey }), { mode: 0o600 });
          chmodSync(runtimeFile, 0o600);
          if (options.startWorker !== false) worker.start();
          logger.info('server.listening', { host: config.host, port: info.port, fixtureMode: config.fixtureMode });
          resolve({
            url: `http://${config.host}:${info.port}`,
            close: () => new Promise<void>((done) => server?.close(() => done()) ?? done()),
          });
        });
        server.on('error', reject);
      }),
    shutdown: async () => {
      await worker.stop();
      await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
      rmSync(runtimeFile, { force: true });
      database.close();
      logger.info('server.stopped');
    },
  };
}

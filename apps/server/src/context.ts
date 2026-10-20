import type { FoiConfig, Logger, OpenDatabase } from '@foi/infra';
import type { LaunchTokens } from './security/launch-tokens.ts';
import type { SessionService } from './security/sessions.ts';
import type { JobQueue } from './worker/queue.ts';

export type Clock = () => number;

export interface AppDeps {
  config: FoiConfig;
  database: OpenDatabase;
  logger: Logger;
  clock: Clock;
  sessions: SessionService;
  launchTokens: LaunchTokens;
  queue: JobQueue;
  /** Cookie name unique to this installation, so other local apps cannot collide with it. */
  cookieName: string;
  /** Secret shared with `npm run open` through a 0600 file; null disables that route. */
  localKey: string | null;
  /** Built web assets; null serves a plain notice instead of the UI. */
  webDistDir: string | null;
  /** Base URL the launch link points at (the Vite dev server in development). */
  webBaseUrl: string;
  version: string;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    sessionHash: string | null;
  };
}

/** The only origin FOI accepts for state-changing requests (ADR-011). */
export const apiOrigin = (deps: Pick<AppDeps, 'config'>): string => `http://${deps.config.host}:${deps.config.port}`;
export const apiHost = (deps: Pick<AppDeps, 'config'>): string => `${deps.config.host}:${deps.config.port}`;

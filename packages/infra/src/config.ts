import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';

/** The server never binds anywhere else (D-020, ADR-011). */
export const LOOPBACK_HOST = '127.0.0.1';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const FileConfigSchema = z
  .object({
    port: z.number().int().min(1024).max(65535).optional(),
    logLevel: z.enum(LOG_LEVELS).optional(),
    fixtureMode: z.boolean().optional(),
  })
  .passthrough();

export interface FoiConfig {
  repoRoot: string;
  host: typeof LOOPBACK_HOST;
  port: number;
  logLevel: LogLevel;
  fixtureMode: boolean;
  dataDir: string;
  /** Non-fatal problems to log and surface in the UI. */
  warnings: string[];
}

const IGNORED_BIND_KEYS = ['bindHost', 'host', 'hostname', 'bind'];

function parseBool(value: string, name: string): boolean {
  if (['1', 'true', 'yes'].includes(value.toLowerCase())) return true;
  if (['0', 'false', 'no'].includes(value.toLowerCase())) return false;
  throw new Error(`${name} must be true or false`);
}

/**
 * Loads `config.json` plus environment overrides. Secrets are never read here;
 * they live in the macOS Keychain (ADR-013).
 */
export function loadConfig(options: { repoRoot: string; env?: NodeJS.ProcessEnv }): FoiConfig {
  const env = options.env ?? process.env;
  const warnings: string[] = [];
  const file = join(options.repoRoot, 'config.json');
  let fromFile: z.infer<typeof FileConfigSchema> = {};
  if (existsSync(file)) {
    const parsed = FileConfigSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!parsed.success) throw new Error(`config.json is invalid: ${parsed.error.message}`);
    fromFile = parsed.data;
    for (const key of Object.keys(fromFile)) {
      if (IGNORED_BIND_KEYS.includes(key)) {
        warnings.push(`config.json key "${key}" is ignored: FOI only listens on ${LOOPBACK_HOST}.`);
      } else if (!['port', 'logLevel', 'fixtureMode'].includes(key)) {
        warnings.push(`config.json key "${key}" is not recognized and was ignored.`);
      }
    }
  }
  if (env.FOI_BIND_HOST !== undefined) {
    warnings.push(`FOI_BIND_HOST is ignored: FOI only listens on ${LOOPBACK_HOST}.`);
  }

  const port = env.FOI_PORT !== undefined ? Number(env.FOI_PORT) : (fromFile.port ?? 4311);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Port must be an integer between 1024 and 65535');
  }
  const logLevel = (env.FOI_LOG_LEVEL ?? fromFile.logLevel ?? 'info') as LogLevel;
  if (!LOG_LEVELS.includes(logLevel)) throw new Error(`Log level must be one of ${LOG_LEVELS.join(', ')}`);
  const fixtureMode =
    env.FOI_FIXTURE_MODE !== undefined
      ? parseBool(env.FOI_FIXTURE_MODE, 'FOI_FIXTURE_MODE')
      : (fromFile.fixtureMode ?? true);
  const dataDir = resolve(env.FOI_DATA_DIR ?? join(options.repoRoot, 'data'));

  return { repoRoot: options.repoRoot, host: LOOPBACK_HOST, port, logLevel, fixtureMode, dataDir, warnings };
}

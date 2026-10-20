import { appendFileSync, chmodSync, existsSync, writeFileSync } from 'node:fs';
import type { LogLevel } from './config.ts';

/**
 * Structured logging through an allowlist of fields (SEC-15). Anything else is
 * dropped, so listing text, prompts, tokens and request bodies cannot leak into
 * logs by accident.
 */
export const LOG_FIELD_ALLOWLIST = new Set([
  'requestId',
  'method',
  'path',
  'status',
  'durationMs',
  'code',
  'reason',
  'jobId',
  'jobType',
  'attempt',
  'count',
  'port',
  'host',
  'fixtureMode',
  'warning',
  'error',
  'migration',
]);

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_VALUE_LENGTH = 300;

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

function sanitize(value: unknown): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) return sanitize(`${value.name}: ${value.message}`);
  const text = String(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

export function filterFields(fields: LogFields = {}): LogFields {
  const out: LogFields = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (LOG_FIELD_ALLOWLIST.has(key)) out[key] = sanitize(value);
    else dropped += 1;
  }
  if (dropped > 0) out.droppedFields = dropped;
  return out;
}

export function createLogger(options: {
  level: LogLevel;
  file?: string;
  /** Minimum level echoed to the terminal; the file always gets everything at `level`. */
  consoleLevel?: LogLevel | 'none';
}): Logger {
  if (options.file && !existsSync(options.file)) {
    writeFileSync(options.file, '', { mode: 0o600 });
    chmodSync(options.file, 0o600);
  }
  const write = (level: LogLevel, event: string, fields?: LogFields) => {
    if (ORDER[level] < ORDER[options.level]) return;
    const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...filterFields(fields) });
    if (options.file) appendFileSync(options.file, `${line}\n`);
    const consoleLevel = options.consoleLevel ?? 'warn';
    if (consoleLevel !== 'none' && ORDER[level] >= ORDER[consoleLevel]) process.stderr.write(`${line}\n`);
  };
  return {
    debug: (e, f) => write('debug', e, f),
    info: (e, f) => write('info', e, f),
    warn: (e, f) => write('warn', e, f),
    error: (e, f) => write('error', e, f),
  };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

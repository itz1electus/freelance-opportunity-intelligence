import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

/**
 * Forward-only migrator (spec §2.2). Each file runs once inside a transaction.
 * An applied file whose checksum changed stops startup: migrations are never edited.
 */
export function migrate(sqlite: Database.Database, dir: string = MIGRATIONS_DIR): MigrationResult {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at_ms INTEGER NOT NULL
  )`);
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  const applied = new Map(
    (sqlite.prepare('SELECT id, checksum FROM schema_migrations').all() as Array<{ id: string; checksum: string }>).map(
      (r) => [r.id, r.checksum],
    ),
  );
  const result: MigrationResult = { applied: [], alreadyApplied: [] };
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = applied.get(file);
    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(`Migration ${file} was edited after it was applied. Add a new migration instead.`);
      }
      result.alreadyApplied.push(file);
      continue;
    }
    sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare('INSERT INTO schema_migrations (id, checksum, applied_at_ms) VALUES (?, ?, ?)')
        .run(file, checksum, Date.now());
    })();
    result.applied.push(file);
  }
  return result;
}

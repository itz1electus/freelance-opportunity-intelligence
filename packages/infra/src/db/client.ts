import { chmodSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  DEFAULT_AGGREGATION_POLICY,
  DEFAULT_BUDGET,
  DEFAULT_CAPACITY,
  DEFAULT_COMMERCIAL_FLOORS,
} from '@foi/domain';
import { migrate, type MigrationResult } from './migrate.ts';
import * as schema from './schema.ts';

export type FoiDatabase = BetterSQLite3Database<typeof schema>;

export interface OpenDatabase {
  sqlite: Database.Database;
  db: FoiDatabase;
  migrations: MigrationResult;
  close(): void;
}

function restrictPermissions(file: string): void {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    if (existsSync(f)) chmodSync(f, 0o600);
  }
}

/**
 * Opens (or creates) the database, applies pragmas and migrations, and seeds
 * defaults. Safe to call repeatedly (P1-02).
 */
export function openDatabase(file: string): OpenDatabase {
  const sqlite = new Database(file);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  if (file !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
  }
  const migrations = migrate(sqlite);
  seedDefaults(sqlite);
  if (file !== ':memory:') restrictPermissions(file);
  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    migrations,
    close: () => {
      if (sqlite.open) {
        if (file !== ':memory:') sqlite.pragma('wal_checkpoint(TRUNCATE)');
        sqlite.close();
      }
    },
  };
}

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  'scoring.aggregation': DEFAULT_AGGREGATION_POLICY,
  'commercial.floors': DEFAULT_COMMERCIAL_FLOORS,
  budget: DEFAULT_BUDGET,
  capacity: DEFAULT_CAPACITY,
};

/** Inserts missing defaults only; never overwrites a value the operator changed. */
export function seedDefaults(sqlite: Database.Database): number {
  const insert = sqlite.prepare(
    'INSERT OR IGNORE INTO app_settings (key, value_json, version, updated_at_ms) VALUES (?, ?, 1, ?)',
  );
  let inserted = 0;
  sqlite.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      inserted += insert.run(key, JSON.stringify(value), Date.now()).changes;
    }
  })();
  return inserted;
}

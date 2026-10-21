import { copyFileSync, mkdtempSync, readdirSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS_DIR, openDatabase, schema } from '../src/index.ts';

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'foi-db-')), 'foi.sqlite');

describe('database foundation', () => {
  it('P1-02: initializing twice is idempotent and seeds no duplicates', () => {
    const file = tempFile();
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const first = openDatabase(file);
    expect(first.migrations.applied).toEqual(all);
    const count1 = first.sqlite.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number };
    first.close();

    const second = openDatabase(file);
    expect(second.migrations.applied).toEqual([]);
    expect(second.migrations.alreadyApplied).toEqual(all);
    const count2 = second.sqlite.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number };
    expect(count2.n).toBe(count1.n);
    expect(count1.n).toBeGreaterThan(0);
    second.close();
  });

  it('seeds the skill vocabulary and six services once', () => {
    const file = tempFile();
    const a = openDatabase(file);
    const count = (sql: string) => (a.sqlite.prepare(sql).get() as { n: number }).n;
    const skills = count('SELECT COUNT(*) AS n FROM skills');
    expect(skills).toBeGreaterThan(40);
    expect(count('SELECT COUNT(*) AS n FROM services')).toBe(6);
    const viaAlias = a.sqlite.prepare("SELECT skill_key FROM skill_aliases WHERE alias_normalized = 'microsoftpowerbi'").get();
    expect(viaAlias).toEqual({ skill_key: 'power-bi' });
    a.close();
    const b = openDatabase(file);
    expect((b.sqlite.prepare('SELECT COUNT(*) AS n FROM skills').get() as { n: number }).n).toBe(skills);
    b.close();
  });

  it('keeps studio profile revisions immutable', () => {
    const { sqlite, close } = openDatabase(':memory:');
    sqlite
      .prepare(
        "INSERT INTO studio_profile_revisions (id, revision, combined_snapshot_json, content_hash, material_hash, created_at_ms) VALUES ('r1', 1, '{}', 'h', 'm', 1)",
      )
      .run();
    expect(() => sqlite.prepare("UPDATE studio_profile_revisions SET content_hash = 'x'").run()).toThrow(/immutable/);
    expect(() => sqlite.prepare('DELETE FROM studio_profile_revisions').run()).toThrow(/immutable/);
    close();
  });

  it('allows only one active partner per slot', () => {
    const { sqlite, close } = openDatabase(':memory:');
    const insert = sqlite.prepare(
      "INSERT INTO partners (id, slot, display_name, active, created_at_ms, updated_at_ms) VALUES (?, 'A', 'X', ?, 0, 0)",
    );
    insert.run('p1', 1);
    expect(() => insert.run('p2', 1)).toThrow(/UNIQUE/);
    expect(() => insert.run('p3', 0)).not.toThrow();
    close();
  });

  it('keeps an operator-changed setting when defaults are re-seeded', () => {
    const file = tempFile();
    const a = openDatabase(file);
    a.sqlite.prepare("UPDATE app_settings SET value_json = '{\"custom\":true}', version = 2 WHERE key = 'budget'").run();
    a.close();
    const b = openDatabase(file);
    const row = b.sqlite.prepare("SELECT value_json, version FROM app_settings WHERE key = 'budget'").get() as {
      value_json: string;
      version: number;
    };
    expect(row).toEqual({ value_json: '{"custom":true}', version: 2 });
    b.close();
  });

  it('refuses to start when an applied migration was edited', () => {
    const dir = mkdtempSync(join(tmpdir(), 'foi-mig-'));
    for (const f of readdirSync(MIGRATIONS_DIR)) copyFileSync(join(MIGRATIONS_DIR, f), join(dir, f));
    const sqlite = new Database(':memory:');
    migrate(sqlite, dir);
    appendFileSync(join(dir, '0001_foundation.sql'), '\n-- edited\n');
    expect(() => migrate(sqlite, dir)).toThrow(/edited after it was applied/);
    writeFileSync(join(dir, '0002_next.sql'), 'CREATE TABLE later (id TEXT PRIMARY KEY);');
  });

  it('SPEC-04: the Drizzle schema matches the migrated tables column for column', () => {
    const { sqlite, close } = openDatabase(':memory:');
    for (const table of Object.values(schema.tables)) {
      const config = getTableConfig(table);
      const actual = (
        sqlite.prepare(`PRAGMA table_info(${config.name})`).all() as Array<{ name: string; notnull: number; pk: number }>
      ).map((c) => ({ name: c.name, notNull: c.notnull === 1 || c.pk === 1 }));
      const expected = config.columns.map((c) => ({ name: c.name, notNull: c.notNull || c.primary }));
      expect(actual.sort((a, b) => a.name.localeCompare(b.name)), config.name).toEqual(
        expected.sort((a, b) => a.name.localeCompare(b.name)),
      );
    }
    close();
  });

  it('creates the database file readable only by its owner (SEC-11)', () => {
    const file = tempFile();
    openDatabase(file).close();
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('SEC-12: audit events cannot be updated or deleted', () => {
    const { sqlite, close } = openDatabase(':memory:');
    sqlite.prepare("INSERT INTO audit_events (id, at_ms, action) VALUES ('a1', 1, 'test')").run();
    expect(() => sqlite.prepare("UPDATE audit_events SET action = 'x' WHERE id = 'a1'").run()).toThrow(/append-only/);
    expect(() => sqlite.prepare("DELETE FROM audit_events WHERE id = 'a1'").run()).toThrow(/append-only/);
    close();
  });

  it('allows one active job per dedupe key, but re-requests after completion', () => {
    const { sqlite, close } = openDatabase(':memory:');
    const insert = sqlite.prepare(
      `INSERT INTO background_jobs (id, job_type, payload_json, dedupe_key, status, run_after_ms, created_at_ms, updated_at_ms)
       VALUES (?, 'fixture_echo', '{}', 'k1', ?, 0, 0, 0)`,
    );
    insert.run('j1', 'queued');
    expect(() => insert.run('j2', 'running')).toThrow(/UNIQUE/);
    sqlite.prepare("UPDATE background_jobs SET status = 'succeeded' WHERE id = 'j1'").run();
    expect(() => insert.run('j3', 'queued')).not.toThrow();
    close();
  });
});

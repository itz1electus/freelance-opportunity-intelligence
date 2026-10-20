import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { findViolations } from '../lib/committable.mjs';

const file = (path: string, content: string | Buffer) => ({ path, content: Buffer.from(content) });

describe('P1-13: pre-commit check', () => {
  it('allows ordinary source files and the shared export', () => {
    expect(
      findViolations([
        file('apps/server/src/app.ts', 'export const x = 1;'),
        file('data/shared/partners/partner-a.yaml', 'name: Partner A\nskills: [sql]\n'),
        file('.env.example', 'FOI_PORT=4311\n'),
      ]),
    ).toEqual([]);
  });

  it('blocks databases, logs, local data and environment files', () => {
    const v = findViolations([
      file('data/foi.sqlite', 'x'),
      file('data/backups/foi-1.sqlite', 'x'),
      file('somewhere/foi.sqlite-wal', 'x'),
      file('data/logs/foi.log', 'x'),
      file('notes.log', 'x'),
      file('.env', 'X=1'),
      file('config/.env.local', 'X=1'),
      file('data/.runtime/server.json', '{}'),
    ]);
    expect(v).toHaveLength(8);
  });

  it('blocks a SQLite database hiding under another name', () => {
    const db = new Database(':memory:');
    const bytes = db.serialize();
    db.close();
    expect(findViolations([{ path: 'docs/diagram.png', content: bytes }])[0]).toMatch(/SQLite database/);
  });

  it('blocks key-shaped secrets in text files', () => {
    const v = findViolations([
      file('a.ts', `const key = "sk-ant-${'a'.repeat(30)}";`),
      // Built at runtime so this test file does not itself trip the pre-commit check.
      file('b.md', ['-----BEGIN', 'OPENSSH', 'PRIVATE', 'KEY-----'].join(' ')),
      file('c.json', `{ "client_${'secret'}": "abcdefghijklmnopqrstuvwxyz" }`),
      file('d.ts', `token = 'ghp_${'x'.repeat(36)}'`),
    ]);
    expect(v).toHaveLength(4);
  });

  it('runs as a real Git hook and blocks a staged database', () => {
    const repo = mkdtempSync(join(tmpdir(), 'foi-git-'));
    const script = fileURLToPath(new URL('../check-committable.mjs', import.meta.url));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'ok.ts'), 'export {}\n');
    execFileSync('git', ['add', 'src/ok.ts'], { cwd: repo });
    expect(spawnSync(process.execPath, [script], { cwd: repo }).status).toBe(0);

    writeFileSync(join(repo, 'foi.sqlite'), 'SQLite format 3\0');
    execFileSync('git', ['add', '-f', 'foi.sqlite'], { cwd: repo });
    const blocked = spawnSync(process.execPath, [script], { cwd: repo });
    expect(blocked.status).toBe(1);
    expect(blocked.stderr.toString()).toContain('foi.sqlite');
  });
});

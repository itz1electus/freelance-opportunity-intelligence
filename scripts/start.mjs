#!/usr/bin/env node
// `npm start`: checks the native SQLite driver, rebuilds the web interface when
// its sources changed, then runs the FOI server and worker in one process.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  const Database = createRequire(join(root, 'packages', 'infra', 'package.json'))('better-sqlite3');
  new Database(':memory:').close();
} catch {
  process.stderr.write('\n  The SQLite driver is not built yet. Run `npm run rebuild:native`, then `npm start`.\n\n');
  process.exit(1);
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs);
  }
  return newest;
}

const web = join(root, 'apps', 'web');
const builtIndex = join(web, 'dist', 'index.html');
const sourcesChanged =
  !existsSync(builtIndex) ||
  Math.max(newestMtime(join(web, 'src')), statSync(join(web, 'index.html')).mtimeMs) > statSync(builtIndex).mtimeMs;
if (sourcesChanged) {
  process.stdout.write('  Building the web interface…\n');
  const build = spawnSync(npm, ['run', 'build', '--silent'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn(
  process.execPath,
  ['--import', 'tsx', join('apps', 'server', 'src', 'cli', 'start.ts'), ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));

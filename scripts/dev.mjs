#!/usr/bin/env node
// `npm run dev`: API with auto-restart plus the Vite dev server with hot reload.
// The sign-in link points at the Vite page (http://127.0.0.1:5173).
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = [
  spawn(
    process.execPath,
    ['--import', 'tsx', '--watch', join('apps', 'server', 'src', 'cli', 'start.ts'), '--web-url', 'http://127.0.0.1:5173'],
    { cwd: root, stdio: 'inherit' },
  ),
  spawn(npm, ['exec', '--workspace', '@foi/web', '--', 'vite'], { cwd: root, stdio: 'inherit' }),
];

const stop = (signal) => {
  for (const child of children) child.kill(signal);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
for (const child of children) child.on('exit', () => stop('SIGTERM'));

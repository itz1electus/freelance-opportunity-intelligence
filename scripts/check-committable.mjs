#!/usr/bin/env node
// Pre-commit check (P1-13): blocks databases, logs, local data and secrets.
// Install as a Git hook with `npm run hooks:install`.
import { execFileSync } from 'node:child_process';
import { findViolations } from './lib/committable.mjs';

function git(args, options = {}) {
  return execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024, ...options });
}

let staged;
try {
  staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString('utf8').split('\0').filter(Boolean);
} catch {
  process.stderr.write('Not a Git repository yet; nothing to check.\n');
  process.exit(0);
}

const files = staged.map((path) => ({ path, content: git(['show', `:${path}`]) }));
const violations = findViolations(files);

if (violations.length > 0) {
  process.stderr.write('\nCommit blocked. These staged files must not enter the repository:\n\n');
  for (const v of violations) process.stderr.write(`  - ${v}\n`);
  process.stderr.write('\nUnstage them with `git restore --staged <file>`. See docs/SECURITY.md.\n\n');
  process.exit(1);
}

#!/usr/bin/env node
// Installs the pre-commit hook that runs scripts/check-committable.mjs.
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooksDir = join(root, '.git', 'hooks');
if (!existsSync(hooksDir)) {
  process.stderr.write('No Git repository here yet. Run `git init`, then `npm run hooks:install`.\n');
  process.exit(1);
}
const hook = join(hooksDir, 'pre-commit');
writeFileSync(hook, '#!/bin/sh\nexec node scripts/check-committable.mjs\n');
chmodSync(hook, 0o755);
process.stdout.write('Installed the pre-commit check.\n');

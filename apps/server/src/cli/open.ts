import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@foi/domain';
import { dataPaths, findRepoRoot, loadConfig, LOOPBACK_HOST } from '@foi/infra';
import { openInBrowser } from './browser.ts';

/** Mints a fresh one-time sign-in link for a running FOI server. */
async function main(): Promise<void> {
  const config = loadConfig({ repoRoot: findRepoRoot() });
  const runtimeFile = join(dataPaths(config.dataDir).runtime, 'server.json');
  if (!existsSync(runtimeFile)) {
    process.stderr.write('\n  FOI is not running. Start it with `npm start`.\n\n');
    process.exit(1);
  }
  const { port, localKey } = JSON.parse(readFileSync(runtimeFile, 'utf8')) as { port: number; localKey: string };
  const origin = `http://${LOOPBACK_HOST}:${port}`;
  let response: Response;
  try {
    response = await fetch(`${origin}/api/v1/auth/launch-tokens`, {
      method: 'POST',
      headers: { origin, [CSRF_HEADER]: CSRF_HEADER_VALUE, 'x-foi-local-key': localKey },
    });
  } catch {
    process.stderr.write('\n  FOI is not responding. Start it with `npm start`.\n\n');
    process.exit(1);
  }
  if (!response.ok) {
    process.stderr.write(`\n  FOI refused to create a sign-in link (HTTP ${response.status}). Restart it with \`npm start\`.\n\n`);
    process.exit(1);
  }
  const { launchUrl } = (await response.json()) as { launchUrl: string };
  process.stdout.write(`\n  Sign in with this one-time link (valid for 2 minutes):\n  ${launchUrl}\n\n`);
  openInBrowser(launchUrl);
}

void main();

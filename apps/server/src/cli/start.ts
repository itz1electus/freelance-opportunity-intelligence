import { findRepoRoot, loadConfig } from '@foi/infra';
import { createRuntime } from '../runtime.ts';
import { openInBrowser } from './browser.ts';

const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  const config = loadConfig({ repoRoot });
  const webBaseUrl = argValue('--web-url') ?? `http://${config.host}:${config.port}`;
  const runtime = createRuntime({ config, webBaseUrl });
  const { url } = await runtime.listen();
  const launchUrl = `${webBaseUrl}/launch#t=${runtime.deps.launchTokens.mint()}`;

  const lines = [
    '',
    `  FOI is running at ${url}${config.fixtureMode ? '  (demo mode: no real opportunities)' : ''}`,
    '',
    '  Sign in with this one-time link (valid for 2 minutes):',
    `  ${launchUrl}`,
    '',
    '  Link expired? Run `npm run open` in another terminal. Press Ctrl+C to stop.',
    '',
  ];
  process.stdout.write(lines.join('\n'));
  openInBrowser(launchUrl);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    process.stdout.write('\n  Stopping FOI…\n');
    await runtime.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/EADDRINUSE/.test(message)) {
    process.stderr.write('\n  Port already in use. Is FOI already running? Try `npm run open`, or change "port" in config.json.\n\n');
  } else if (/better_sqlite3|NODE_MODULE_VERSION|Could not locate the bindings/i.test(message)) {
    process.stderr.write('\n  The SQLite driver is not built for this Node version. Run `npm run rebuild:native`.\n\n');
  } else {
    process.stderr.write(`\n  FOI could not start: ${message}\n\n`);
  }
  process.exit(1);
});

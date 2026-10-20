import { execFile } from 'node:child_process';

/**
 * Opens a URL in the default browser without a shell, so the URL can never be
 * interpreted as a command. Falls back to printing it.
 */
export function openInBrowser(url: string): void {
  if (process.env.FOI_NO_OPEN === '1' || process.argv.includes('--no-open')) return;
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
  if (!command) return;
  execFile(command, [url], { timeout: 10_000 }, () => {
    // Ignore failures; the URL is always printed as well.
  });
}

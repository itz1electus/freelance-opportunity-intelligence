import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walks up from `start` to the workspace root (the package.json named "foi"). */
export function findRepoRoot(start: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(start);
  for (;;) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string };
        if (parsed.name === 'foi') return dir;
      } catch {
        // keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Could not find the FOI repository root');
    dir = parent;
  }
}

export interface DataPaths {
  root: string;
  database: string;
  shared: string;
  backups: string;
  logs: string;
  runtime: string;
}

export function dataPaths(dataDir: string): DataPaths {
  const root = resolve(dataDir);
  return {
    root,
    database: join(root, 'foi.sqlite'),
    shared: join(root, 'shared'),
    backups: join(root, 'backups'),
    logs: join(root, 'logs'),
    runtime: join(root, '.runtime'),
  };
}

/**
 * Creates the data layout (ADR-020). Private directories are 0700; `shared/`
 * holds committed text and keeps normal permissions.
 */
export function ensureDataDirs(paths: DataPaths): void {
  for (const dir of [paths.root, paths.backups, paths.logs, paths.runtime]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  mkdirSync(paths.shared, { recursive: true });
}

const RISKY_LOCATIONS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\/Library\/Mobile Documents\//, label: 'iCloud Drive' },
  { pattern: /\/Library\/CloudStorage\//, label: 'a cloud-storage provider folder' },
  { pattern: /\/Dropbox(\/|$)/i, label: 'Dropbox' },
  { pattern: /\/OneDrive[^/]*(\/|$)/i, label: 'OneDrive' },
  { pattern: /\/Google Drive(\/|$)/i, label: 'Google Drive' },
  { pattern: /^\/Volumes\//, label: 'an external or network volume' },
  { pattern: /^\/(net|Network)\//, label: 'a network mount' },
];

/**
 * Warns when the data folder sits where sync or network filesystems can corrupt a
 * live SQLite database (SEC-11, P1-12). Heuristic by path; never blocks startup.
 */
export function detectRiskyLocation(path: string): string[] {
  const normalized = resolve(path).split(sep).join('/');
  return RISKY_LOCATIONS.filter(({ pattern }) => pattern.test(normalized)).map(
    ({ label }) =>
      `The data folder is inside ${label}. Sync and network filesystems can corrupt a live SQLite database; move the project folder to a local disk.`,
  );
}

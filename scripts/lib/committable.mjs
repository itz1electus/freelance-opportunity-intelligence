/**
 * Decides whether staged files are safe to commit (ADR-020, SEC-11, SEC-13).
 * Pure function: callers pass paths and contents, so it is easy to test.
 */

const BLOCKED_EXTENSIONS = /\.(sqlite|sqlite-wal|sqlite-shm|sqlite3|db|log|foisnap|pem|key|p12|pfx)$/i;
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');

const SECRET_PATTERNS = [
  { name: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key ID', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  {
    name: 'credential assignment',
    pattern: /\b(api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password)\b\s*["']?\s*[:=]\s*["'][^"'\s]{16,}["']/i,
  },
];

/** Paths under data/ are local-only, except the committed text export. */
function isLocalDataPath(path) {
  return path.startsWith('data/') && !path.startsWith('data/shared/');
}

/**
 * @param {Array<{ path: string, content: Buffer }>} files
 * @returns {string[]} human-readable violations; empty means safe
 */
export function findViolations(files) {
  const violations = [];
  for (const { path, content } of files) {
    const name = path.split('/').pop() ?? path;
    if (isLocalDataPath(path)) {
      violations.push(`${path}: files under data/ stay on this machine; only data/shared/ is committed.`);
      continue;
    }
    if (BLOCKED_EXTENSIONS.test(path)) {
      violations.push(`${path}: databases, logs, snapshots and key files are never committed.`);
      continue;
    }
    if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') {
      violations.push(`${path}: environment files are never committed; secrets belong in the Keychain.`);
      continue;
    }
    if (content.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) {
      violations.push(`${path}: this is a SQLite database under another name.`);
      continue;
    }
    if (content.includes(0)) continue; // other binary files: no text scan
    const text = content.toString('utf8');
    for (const { name: kind, pattern } of SECRET_PATTERNS) {
      if (pattern.test(text)) violations.push(`${path}: looks like it contains a ${kind}.`);
    }
  }
  return violations;
}

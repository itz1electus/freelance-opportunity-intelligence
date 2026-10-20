import { SESSION_IDLE_TIMEOUT_MS } from '@foi/domain';
import type Database from 'better-sqlite3';
import type { Clock } from '../context.ts';
import { randomToken, sha256 } from './tokens.ts';

export interface SessionRecord {
  idHash: string;
  createdAtMs: number;
  lastSeenAtMs: number;
  expiresAtMs: number;
}

/** Only refresh last-seen at most once a minute, to avoid a write per request. */
const TOUCH_INTERVAL_MS = 60_000;

/**
 * Server-side sessions (ADR-012). The cookie carries 256 random bits; the
 * database stores only their SHA-256, so a copied database cannot be replayed
 * as a login. There is no signing key to leak.
 */
export class SessionService {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly clock: Clock,
    private readonly idleTimeoutMs: number = SESSION_IDLE_TIMEOUT_MS,
  ) {}

  create(userAgent: string | null): { cookieValue: string; record: SessionRecord } {
    const cookieValue = randomToken();
    const now = this.clock();
    const record: SessionRecord = {
      idHash: sha256(cookieValue),
      createdAtMs: now,
      lastSeenAtMs: now,
      expiresAtMs: now + this.idleTimeoutMs,
    };
    this.sqlite
      .prepare(
        'INSERT INTO sessions (id_hash, created_at_ms, last_seen_at_ms, expires_at_ms, user_agent) VALUES (?, ?, ?, ?, ?)',
      )
      .run(record.idHash, record.createdAtMs, record.lastSeenAtMs, record.expiresAtMs, userAgent?.slice(0, 200) ?? null);
    this.sqlite.prepare('DELETE FROM sessions WHERE expires_at_ms <= ?').run(now);
    return { cookieValue, record };
  }

  /** Validates a cookie value and slides the idle timeout. */
  verify(cookieValue: string | undefined): SessionRecord | null {
    if (!cookieValue || cookieValue.length > 200) return null;
    const idHash = sha256(cookieValue);
    const row = this.sqlite
      .prepare(
        'SELECT id_hash AS idHash, created_at_ms AS createdAtMs, last_seen_at_ms AS lastSeenAtMs, expires_at_ms AS expiresAtMs FROM sessions WHERE id_hash = ?',
      )
      .get(idHash) as SessionRecord | undefined;
    if (!row) return null;
    const now = this.clock();
    if (row.expiresAtMs <= now) {
      this.sqlite.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
      return null;
    }
    if (now - row.lastSeenAtMs >= TOUCH_INTERVAL_MS) {
      row.lastSeenAtMs = now;
      row.expiresAtMs = now + this.idleTimeoutMs;
      this.sqlite
        .prepare('UPDATE sessions SET last_seen_at_ms = ?, expires_at_ms = ? WHERE id_hash = ?')
        .run(row.lastSeenAtMs, row.expiresAtMs, idHash);
    }
    return row;
  }

  revoke(idHash: string): void {
    this.sqlite.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
  }

  revokeAll(): number {
    return this.sqlite.prepare('DELETE FROM sessions').run().changes;
  }
}

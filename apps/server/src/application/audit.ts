import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface AuditInput {
  action: string;
  subjectType?: string;
  subjectId?: string;
  /** Sanitized details only: never secrets, tokens, listing text or prompts. */
  details?: Record<string, string | number | boolean | null>;
  requestId?: string;
}

export interface AuditEventView {
  id: string;
  at: string;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  details: Record<string, unknown>;
  requestId: string | null;
}

/** Append-only audit log (SEC-12); the table rejects updates and deletes. */
export function recordAudit(sqlite: Database.Database, input: AuditInput, now: number = Date.now()): void {
  sqlite
    .prepare(
      'INSERT INTO audit_events (id, at_ms, action, subject_type, subject_id, details_json, request_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      randomUUID(),
      now,
      input.action,
      input.subjectType ?? null,
      input.subjectId ?? null,
      JSON.stringify(input.details ?? {}),
      input.requestId ?? null,
    );
}

export function listAudit(sqlite: Database.Database, limit: number): AuditEventView[] {
  const rows = sqlite
    .prepare(
      'SELECT id, at_ms, action, subject_type, subject_id, details_json, request_id FROM audit_events ORDER BY at_ms DESC, id DESC LIMIT ?',
    )
    .all(limit) as Array<{
    id: string;
    at_ms: number;
    action: string;
    subject_type: string | null;
    subject_id: string | null;
    details_json: string;
    request_id: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.at_ms).toISOString(),
    action: r.action,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    details: JSON.parse(r.details_json) as Record<string, unknown>,
    requestId: r.request_id,
  }));
}

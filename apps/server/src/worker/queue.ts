import { randomUUID } from 'node:crypto';
import type { JobStatus, JobType, JobView } from '@foi/domain';
import type Database from 'better-sqlite3';
import type { Clock } from '../context.ts';

interface JobRow {
  id: string;
  search_run_id: string | null;
  job_type: JobType;
  payload_json: string;
  dedupe_key: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  cancel_requested: number;
  lease_owner: string | null;
  lease_until_ms: number | null;
  run_after_ms: number;
  result_json: string | null;
  last_error: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  completed_at_ms: number | null;
}

export interface ClaimedJob {
  id: string;
  jobType: JobType;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string;
}

export interface EnqueueInput {
  jobType: JobType;
  payload: unknown;
  /** Must encode the complete logical work identity (spec §4.3), never just the first item of a batch. */
  dedupeKey: string;
  maxAttempts?: number;
  searchRunId?: string | null;
}

const toView = (r: JobRow): JobView => ({
  id: r.id,
  jobType: r.job_type,
  status: r.status,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  cancelRequested: r.cancel_requested === 1,
  result: r.result_json === null ? null : (JSON.parse(r.result_json) as unknown),
  lastError: r.last_error,
  createdAt: new Date(r.created_at_ms).toISOString(),
  updatedAt: new Date(r.updated_at_ms).toISOString(),
  completedAt: r.completed_at_ms === null ? null : new Date(r.completed_at_ms).toISOString(),
});

/** Bounded exponential backoff with jitter: 1 s, 2 s, 4 s … capped at 60 s. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + 0.4 * random()));
}

/**
 * Durable SQLite-backed queue (spec §4.3, ADR-021). Every state change is one
 * guarded UPDATE, so a worker that lost its lease cannot complete or fail a job
 * another worker has since claimed (P1-05).
 */
export class JobQueue {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly clock: Clock,
  ) {}

  enqueue(input: EnqueueInput): { job: JobView; created: boolean } {
    const now = this.clock();
    const id = randomUUID();
    const inserted = this.sqlite
      .prepare(
        `INSERT INTO background_jobs
           (id, search_run_id, job_type, payload_json, dedupe_key, status, attempts, max_attempts,
            cancel_requested, run_after_ms, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, 0, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      .run(
        id,
        input.searchRunId ?? null,
        input.jobType,
        JSON.stringify(input.payload),
        input.dedupeKey,
        input.maxAttempts ?? 3,
        now,
        now,
        now,
      );
    if (inserted.changes === 1) return { job: this.get(id)!, created: true };
    const existing = this.sqlite
      .prepare("SELECT * FROM background_jobs WHERE dedupe_key = ? AND status IN ('queued', 'running')")
      .get(input.dedupeKey) as JobRow | undefined;
    if (!existing) throw new Error('Job insert conflicted but no active job holds the dedupe key');
    return { job: toView(existing), created: false };
  }

  get(id: string): JobView | null {
    const row = this.sqlite.prepare('SELECT * FROM background_jobs WHERE id = ?').get(id) as JobRow | undefined;
    return row ? toView(row) : null;
  }

  /**
   * Claims the oldest ready job, or reclaims a running job whose lease expired
   * (crash recovery). Jobs that already used every attempt fail instead.
   */
  claim(owner: string, leaseMs: number): ClaimedJob | null {
    const now = this.clock();
    return this.sqlite.transaction((): ClaimedJob | null => {
      this.sqlite
        .prepare(
          `UPDATE background_jobs
              SET status = 'failed', lease_owner = NULL, lease_until_ms = NULL,
                  last_error = 'Lease expired on the final attempt', updated_at_ms = ?, completed_at_ms = ?
            WHERE status = 'running' AND lease_until_ms < ? AND attempts >= max_attempts`,
        )
        .run(now, now, now);
      this.sqlite
        .prepare(
          `UPDATE background_jobs
              SET status = 'cancelled', lease_owner = NULL, lease_until_ms = NULL, updated_at_ms = ?, completed_at_ms = ?
            WHERE status = 'running' AND lease_until_ms < ? AND cancel_requested = 1`,
        )
        .run(now, now, now);
      const row = this.sqlite
        .prepare(
          `UPDATE background_jobs
              SET status = 'running', lease_owner = ?, lease_until_ms = ?, attempts = attempts + 1, updated_at_ms = ?
            WHERE id = (
              SELECT id FROM background_jobs
               WHERE (status = 'queued' AND run_after_ms <= ? AND cancel_requested = 0)
                  OR (status = 'running' AND lease_until_ms < ?)
               ORDER BY created_at_ms, id
               LIMIT 1)
            RETURNING *`,
        )
        .get(owner, now + leaseMs, now, now, now) as JobRow | undefined;
      if (!row) return null;
      return {
        id: row.id,
        jobType: row.job_type,
        payload: JSON.parse(row.payload_json) as unknown,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        leaseOwner: owner,
      };
    }).immediate();
  }

  /** Extends the lease; returns false if this worker no longer owns the job. */
  renew(id: string, owner: string, leaseMs: number): { owned: boolean; cancelRequested: boolean } {
    const now = this.clock();
    const changed = this.sqlite
      .prepare(
        `UPDATE background_jobs SET lease_until_ms = ?, updated_at_ms = ?
          WHERE id = ? AND lease_owner = ? AND status = 'running'`,
      )
      .run(now + leaseMs, now, id, owner).changes;
    const row = this.sqlite.prepare('SELECT cancel_requested FROM background_jobs WHERE id = ?').get(id) as
      | { cancel_requested: number }
      | undefined;
    return { owned: changed === 1, cancelRequested: row?.cancel_requested === 1 };
  }

  complete(id: string, owner: string, result: unknown): boolean {
    const now = this.clock();
    return (
      this.sqlite
        .prepare(
          `UPDATE background_jobs
              SET status = 'succeeded', result_json = ?, lease_owner = NULL, lease_until_ms = NULL,
                  last_error = NULL, updated_at_ms = ?, completed_at_ms = ?
            WHERE id = ? AND lease_owner = ? AND status = 'running'`,
        )
        .run(JSON.stringify(result ?? null), now, now, id, owner).changes === 1
    );
  }

  /** Requeues with backoff while attempts remain and the error is retryable; otherwise fails. */
  fail(id: string, owner: string, error: string, retryable: boolean): 'requeued' | 'failed' | 'lost' {
    const now = this.clock();
    const row = this.sqlite
      .prepare("SELECT attempts, max_attempts FROM background_jobs WHERE id = ? AND lease_owner = ? AND status = 'running'")
      .get(id, owner) as { attempts: number; max_attempts: number } | undefined;
    if (!row) return 'lost';
    const message = error.slice(0, 500);
    if (retryable && row.attempts < row.max_attempts) {
      this.sqlite
        .prepare(
          `UPDATE background_jobs
              SET status = 'queued', lease_owner = NULL, lease_until_ms = NULL, last_error = ?,
                  run_after_ms = ?, updated_at_ms = ?
            WHERE id = ? AND lease_owner = ?`,
        )
        .run(message, now + backoffMs(row.attempts), now, id, owner);
      return 'requeued';
    }
    this.sqlite
      .prepare(
        `UPDATE background_jobs
            SET status = 'failed', lease_owner = NULL, lease_until_ms = NULL, last_error = ?,
                updated_at_ms = ?, completed_at_ms = ?
          WHERE id = ? AND lease_owner = ?`,
      )
      .run(message, now, now, id, owner);
    return 'failed';
  }

  markCancelled(id: string, owner: string): boolean {
    const now = this.clock();
    return (
      this.sqlite
        .prepare(
          `UPDATE background_jobs
              SET status = 'cancelled', lease_owner = NULL, lease_until_ms = NULL, updated_at_ms = ?, completed_at_ms = ?
            WHERE id = ? AND lease_owner = ? AND status = 'running'`,
        )
        .run(now, now, id, owner).changes === 1
    );
  }

  /** Queued jobs cancel at once; running jobs get a flag their worker honours cooperatively. */
  requestCancel(id: string): JobView | null {
    const now = this.clock();
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          "UPDATE background_jobs SET status = 'cancelled', cancel_requested = 1, updated_at_ms = ?, completed_at_ms = ? WHERE id = ? AND status = 'queued'",
        )
        .run(now, now, id);
      this.sqlite
        .prepare("UPDATE background_jobs SET cancel_requested = 1, updated_at_ms = ? WHERE id = ? AND status = 'running'")
        .run(now, id);
    })();
    return this.get(id);
  }
}

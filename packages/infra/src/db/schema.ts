/**
 * Drizzle table definitions for typed queries. The SQL files in ../../migrations
 * are what create the tables; a test checks the two agree (SPEC-04, PROC-01).
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  version: integer('version').notNull().default(1),
  updatedAtMs: integer('updated_at_ms').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    createdAtMs: integer('created_at_ms').notNull(),
    lastSeenAtMs: integer('last_seen_at_ms').notNull(),
    expiresAtMs: integer('expires_at_ms').notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('idx_sessions_expiry').on(t.expiresAtMs)],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    atMs: integer('at_ms').notNull(),
    action: text('action').notNull(),
    subjectType: text('subject_type'),
    subjectId: text('subject_id'),
    detailsJson: text('details_json').notNull().default('{}'),
    requestId: text('request_id'),
  },
  (t) => [index('idx_audit_at').on(t.atMs)],
);

export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code').notNull(),
    responseJson: text('response_json').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    expiresAtMs: integer('expires_at_ms').notNull(),
  },
  (t) => [index('idx_idempotency_expiry').on(t.expiresAtMs)],
);

export const backgroundJobs = sqliteTable(
  'background_jobs',
  {
    id: text('id').primaryKey(),
    searchRunId: text('search_run_id'),
    jobType: text('job_type').notNull(),
    payloadJson: text('payload_json').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    cancelRequested: integer('cancel_requested', { mode: 'boolean' }).notNull().default(false),
    leaseOwner: text('lease_owner'),
    leaseUntilMs: integer('lease_until_ms'),
    runAfterMs: integer('run_after_ms').notNull(),
    resultJson: text('result_json'),
    lastError: text('last_error'),
    createdAtMs: integer('created_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
    completedAtMs: integer('completed_at_ms'),
  },
  (t) => [index('idx_jobs_status_lease').on(t.status, t.leaseUntilMs), index('idx_jobs_ready').on(t.status, t.runAfterMs)],
);

export const tables = { appSettings, sessions, auditEvents, idempotencyKeys, backgroundJobs };

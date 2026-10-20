-- Phase 1 foundation (spec v1.1.0 §2.2 "Additional tables and columns").
-- Forward-only: never edit this file after it has been applied; add a new migration.
-- All times are UTC epoch milliseconds (ADR-007).

CREATE TABLE app_settings (
  key            TEXT PRIMARY KEY,
  value_json     TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at_ms  INTEGER NOT NULL
);

-- Opaque random session values; only their SHA-256 hash is stored (ADR-012).
CREATE TABLE sessions (
  id_hash          TEXT PRIMARY KEY,
  created_at_ms    INTEGER NOT NULL,
  last_seen_at_ms  INTEGER NOT NULL,
  expires_at_ms    INTEGER NOT NULL,
  user_agent       TEXT
);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at_ms);

-- Append-only audit trail (SEC-12). The application exposes no update or delete.
CREATE TABLE audit_events (
  id            TEXT PRIMARY KEY,
  at_ms         INTEGER NOT NULL,
  action        TEXT NOT NULL,
  subject_type  TEXT,
  subject_id    TEXT,
  details_json  TEXT NOT NULL DEFAULT '{}',
  request_id    TEXT
);
CREATE INDEX idx_audit_at ON audit_events(at_ms DESC);

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;

CREATE TABLE idempotency_keys (
  key            TEXT PRIMARY KEY,
  method         TEXT NOT NULL,
  path           TEXT NOT NULL,
  request_hash   TEXT NOT NULL,
  status_code    INTEGER NOT NULL,
  response_json  TEXT NOT NULL,
  created_at_ms  INTEGER NOT NULL,
  expires_at_ms  INTEGER NOT NULL
);
CREATE INDEX idx_idempotency_expiry ON idempotency_keys(expires_at_ms);

-- Durable job queue (spec §4.3). search_run_id gains its foreign key when
-- search_runs arrives in Phase 3.
CREATE TABLE background_jobs (
  id                TEXT PRIMARY KEY,
  search_run_id     TEXT,
  job_type          TEXT NOT NULL,
  payload_json      TEXT NOT NULL,
  dedupe_key        TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts      INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  cancel_requested  INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0, 1)),
  lease_owner       TEXT,
  lease_until_ms    INTEGER,
  run_after_ms      INTEGER NOT NULL,
  result_json       TEXT,
  last_error        TEXT,
  created_at_ms     INTEGER NOT NULL,
  updated_at_ms     INTEGER NOT NULL,
  completed_at_ms   INTEGER
);
CREATE INDEX idx_jobs_status_lease ON background_jobs(status, lease_until_ms);
CREATE INDEX idx_jobs_ready ON background_jobs(status, run_after_ms);
-- One active job per logical work identity; finished work may be re-requested.
CREATE UNIQUE INDEX ux_jobs_active ON background_jobs(dedupe_key) WHERE status IN ('queued', 'running');

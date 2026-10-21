# ADR-024: Synchronising the database with data/shared

- **Status:** Accepted
- **Date:** 2026-10-21
- **Refines:** ADR-020, D-025 (CONFIRMED: team data is committed as text in `data/shared/`)
- **Related tests:** P2-09; `apps/server/test/shared.test.ts`

## Context

Team-owned data is edited in FOI, stored in the local SQLite database, and shared through Git as JSON files (D-025, decided JSON on 2026-10-21). Two copies of the same data need one clear rule for which wins, or a `git pull` could silently overwrite a teammate's work, or FOI could overwrite a pull.

## Decision

1. **Files are the shared copy; the database is the working copy.** After every committed change, FOI rewrites the files whose content changed (atomic write and rename) and records a fingerprint: a SHA-256 over every managed file's path and content hash.
2. **Outside changes are detected, never overwritten.** Before every profile change, and whenever the UI asks for status, FOI compares the files with the recorded fingerprint. A mismatch means someone changed them outside FOI, usually `git pull`. Edits are then refused with `409 SHARED_DATA_CONFLICT` until the operator chooses **Load team changes** (`POST /api/v1/shared/reload`).
3. **Startup loads outside changes automatically**, after a `VACUUM INTO` backup in `data/backups/` when the database already had data. A fresh clone with no database is loaded the same way.
4. **Loading validates everything first.** Every file is checked against a strict schema, and cross-file references (partners, skills, services) are checked too. Files with Git conflict markers are rejected. Any problem names the file and blocks edits with `SHARED_DATA_INVALID`, so a broken file is never overwritten. The database keeps the last good data.
5. **Loading keeps identity.** Partner and evidence IDs, profile versions and timestamps come from the files. If the recomputed studio snapshot matches `studio/current.json`, the revision keeps its ID and timestamp. Revision *numbers* and change history are local to each machine.
6. **FOI owns only these paths:** `foi-shared.json`, `partners/a.json`, `partners/b.json`, `evidence/<uuid>.json`, `taxonomy/skills.json`, `studio/current.json`. Other files in `data/shared/` are left alone; symlinks and files over 1 MB are ignored or rejected.
7. **A failed export is retried** on the next check, and is not mistaken for an outside change. The UI shows the error until a write succeeds.

## Format

Pretty-printed JSON, keys sorted, two-space indent, trailing newline, arrays in a stable order. `foi-shared.json` carries `formatVersion: 1`; FOI refuses files written by a newer format version.

## Alternatives considered

- **Database file in Git:** rejected (binary merges, retention rules, history growth); see the 2026-10-20 discussion.
- **Database wins on startup:** rejected, because it would silently discard a teammate's pulled changes.
- **Automatic three-way merge:** unnecessary for two partners editing mostly separate files; Git already does line merges, and conflict markers are detected.

## Consequences

- A teammate's change shows as a banner with one button, not as a surprise.
- Seeded vocabulary is not exported; only operator-added skills are. The built-in vocabulary wins if both define a key.
- Fixture rows will be excluded from the export once fixture listings exist (Phase 3).

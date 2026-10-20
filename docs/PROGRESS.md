# FOI progress and handoff

Read this first when resuming work. It says what exists, what was verified, and what comes next.

## Status

| Phase | State | Date |
| --- | --- | --- |
| Spec freeze (baseline and architecture v1.1.0) | Done | 2026-10-20 |
| 1 — Foundation, security shell, contracts | **Done; gate passed** | 2026-10-20 |
| 2 — Partner profiles and studio profile | Next | |
| 3 — Sources and manual search | Not started | |
| 4 — Eligibility and scoring | Not started | |
| 5 — Technical assessments and cost controls | Not started | |
| 6 — Full dashboard and shortlist | Not started | |
| 7 — Hardening and release | Not started | |

## Phase 1 gate

All checks ran with `npm run check` in this folder and again in a clean copy (`npm ci`, `npm run rebuild:native`, `npm run check`): typecheck, lint, 67 tests, build, and zero `npm audit` findings.

| Test | Result | Where |
| --- | --- | --- |
| P1-01 Fresh start serves health and UI on loopback | Pass | `apps/server/test/listen.test.ts`; also driven by hand with `npm start` and a headless browser |
| P1-02 Initializing twice is idempotent | Pass | `packages/infra/test/database.test.ts` |
| P1-03 Only an authenticated operator reads or mutates | Pass | `apps/server/test/security.test.ts` |
| P1-04 Foreign Host, origin or missing header: no side effect | Pass | `security.test.ts` |
| P1-05 Crashed worker's job recovers without double completion | Pass | `apps/server/test/worker.test.ts` |
| P1-06 Typecheck, lint, tests and build | Pass | `npm run check` |
| P1-07 No credentials: only demo source enabled | Pass | `packages/connectors/test`, `apps/server/test/api.test.ts` |
| P1-08 Another localhost port refused despite a valid cookie | Pass | `security.test.ts` |
| P1-09 Reads require a session | Pass | `security.test.ts` |
| P1-10 Launch token single-use, expires after 2 minutes | Pass | `apps/server/test/auth.test.ts` |
| P1-11 Non-loopback bind settings ignored | Pass | `packages/infra/test/config.test.ts` |
| P1-12 Synced or network data folder warns | Pass (path heuristic) | `config.test.ts` |
| P1-13 Pre-commit check blocks databases, logs and secrets | Pass | `scripts/test/committable.test.ts` (runs a real Git hook) |
| P1-14 Idempotency keys replay or conflict correctly | Pass | `api.test.ts` |
| P1-15 Sign out everywhere revokes all sessions and is audited | Pass | `auth.test.ts` |

**Verified on Linux, not yet on a Mac.** Untested there: the `open` command that launches the browser, the Charter typeface (the fallback serif renders elsewhere), and the SQLite driver build on Apple Silicon. Run `npm run check` once on the Mac to confirm.

## What exists

- `packages/domain`: money (exact minor units, ISO 4217 exponents), source and job contracts, error codes, all numeric defaults with the frozen-semantics validator.
- `packages/infra`: configuration (loopback only), data folder layout and permissions, allowlisted logging, SQLite with WAL, forward-only checksummed migrations, seeded settings.
- `packages/connectors`: source registry; every live source disabled until Phase 3.
- `apps/server`: Hono API with the full ADR-011 guard chain, launch-token sign-in, hashed sessions, audit log, idempotency, durable job queue with leases and retries, in-process worker, `npm start` and `npm run open`.
- `apps/web`: React shell with the three-column Opportunities layout, the score legend, demo banner, budget meter, Settings (sources, worker check, sign-out everywhere, recent activity). Pages for later phases say what will arrive and when.

## API at Phase 1

`GET /api/v1/health`, `GET /setup/status`, `POST /auth/launch`, `POST /auth/launch-tokens` (local key), `GET|DELETE /auth/session`, `DELETE /auth/sessions`, `GET /system`, `GET /sources`, `GET /audit-events`, `POST /fixture/jobs` (demo mode only), `GET /jobs/:id`, `POST /jobs/:id/cancel`.

## Next: Phase 2

Scope (spec §11 Phase 2, P2-01 to P2-09):

1. Migration `0002`: `partners` (with `active` flag, SPEC-09), `skills` and `skill_aliases`, `partner_skills`, `portfolio_evidence`, `partner_evidence`, `services`, `partner_services`, `studio_profile_revisions` with `content_hash` and `studio_material_hash` (COST-03).
2. Seed the six service categories and a starter skill taxonomy with aliases (for example "Power BI", "PowerBI", "Microsoft Power BI").
3. Studio profile derivation: union of skills with per-partner provenance, evidence index without double counting, capacity per partner.
4. `data/shared/` export on every change and import on an empty database (P2-09). **Decision needed at the start of Phase 2:** pretty-printed JSON (no new dependency, proposed) or YAML (needs a parser dependency).
5. First-run wizard and the two partner editors (UX-01, UX-12).

## Open issues

None.

## Resuming in the Claude desktop app

1. Unzip the project to a local folder, for example `~/Projects/foi` (not iCloud Drive or Dropbox).
2. In that folder: `npm ci`, `npm run rebuild:native`, `npm run check`, then `npm start`.
3. Optionally `npm run hooks:install` (the folder already has Git history).
4. Open the FOI Project in the Claude desktop app, link the folder, and ask to continue with Phase 2. The frozen specs and this file are also saved in the Project.

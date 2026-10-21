# FOI progress and handoff

Read this first when resuming work. It says what exists, what was verified, and what comes next.

## Status

| Phase | State | Date |
| --- | --- | --- |
| Spec freeze (baseline and architecture v1.1.0; editorial 1.1.1) | Done | 2026-10-20, 2026-10-21 |
| 1 — Foundation, security shell, contracts | **Done; gate passed** (also confirmed running on the Mac) | 2026-10-20 |
| 2 — Partner profiles and studio profile | **Done; gate passed** | 2026-10-21 |
| 3 — Sources and manual search | Next | |
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

## Phase 2 gate

`npm run check` passes: typecheck, lint, 108 tests and build. The profile screens were also driven end to end in a headless browser, desktop and mobile, with no console errors: setup, skills (including a new vocabulary skill and undo), services, qualifications, joint evidence, the studio view, and a simulated teammate change through `data/shared`.

| Test | Result | Where |
| --- | --- | --- |
| P2-01 Two separately editable partner slots after setup | Pass | `apps/server/test/profiles.test.ts` |
| P2-02 Skill on Partner A only is attributed only to A | Pass | `profiles.test.ts`, `packages/domain/test/studio.test.ts` |
| P2-03 Shared skill counted once; joint evidence counted once | Pass | `profiles.test.ts`, `studio.test.ts` |
| P2-04 Skill, evidence and hours edits bump the partner version and add an immutable revision | Pass | `profiles.test.ts`; immutability trigger in `packages/infra/test/database.test.ts` |
| P2-05 Older studio revision makes an evaluation stale | Pass at domain level (`studioStaleness`); the evaluation read model arrives in Phase 4 | `studio.test.ts` |
| P2-06 Skill only B holds is limited to B's hours, not the pooled 45 | Pass at domain level (`capacityForSkills`); feasibility uses it from Phase 4 | `studio.test.ts`, `profiles.test.ts` |
| P2-07 Claim without evidence shown as a gap, nothing fabricated | Pass | `profiles.test.ts`, `studio.test.ts`; UI "No evidence" flags and "Worth checking" list |
| P2-08 Notes-only edit keeps the material hash | Pass | `profiles.test.ts`, `studio.test.ts` |
| P2-09 Export then import into an empty database reproduces team data exactly | Pass. Fixture exclusion applies from Phase 3, when fixture rows exist | `apps/server/test/shared.test.ts` |

Also covered: outside changes block edits until loaded; files with merge-conflict markers are refused and never overwritten; files deleted by a teammate are applied; startup loads changes after a database backup; unknown skills or partners in files are rejected; only changed files are rewritten.

## What exists

- `packages/domain`: money, source and job contracts, error codes, numeric defaults; **Phase 2:** canonical JSON, the skill vocabulary (58 skills with aliases) and six services, profile contracts, and pure studio functions: snapshot derivation, material projection, diff, staleness, per-skill capacity, completeness.
- `packages/infra`: configuration (loopback only), data layout and permissions, allowlisted logging, SQLite with WAL, checksummed migrations `0001_foundation` and `0002_profiles`, seeded settings and vocabulary.
- `packages/connectors`: source registry; every live source disabled until Phase 3.
- `apps/server`: the ADR-011 guard chain, launch-token sign-in, sessions, audit log, idempotency, job queue and worker; **Phase 2:** `ProfileService` (transactional changes, version bumps, immutable revisions) and `SharedSync` (`data/shared` export, outside-change detection, validated loading).
- `apps/web`: shell, Opportunities layout, Settings; **Phase 2:** first-run setup, Studio overview with the combined skills matrix, partner editors (basics, skills with vocabulary matching, services, qualifications, exclusions), evidence editor, the team-changes banner, and undo toasts.

## API

Phase 1: `GET /health`, `GET /setup/status`, `POST /auth/launch`, `POST /auth/launch-tokens`, `GET|DELETE /auth/session`, `DELETE /auth/sessions`, `GET /system`, `GET /sources`, `GET /audit-events`, `POST /fixture/jobs`, `GET /jobs/:id`, `POST /jobs/:id/cancel`.

Phase 2: `POST /setup/partners`; `GET /partners`, `GET|PATCH /partners/:id`; `PUT|DELETE /partners/:id/skills/:skillKey`; `PUT|DELETE /partners/:id/services/:serviceId`; `GET|POST /skills`; `GET /services`; `GET|POST /evidence`, `PUT|DELETE /evidence/:id`; `GET /studio-profile`, `GET /studio-profile/revisions`; `GET /shared/status`, `POST /shared/reload`.

## Next: Phase 3 — sources and manual search

Scope (spec §11 Phase 3, P3-01 to P3-19):

1. Migration `0003`: `sources`, `source_policies` (with attestation fields), `source_connections`, `search_presets`, `search_runs`, `search_run_sources`, `opportunities`, `source_listings`, `source_listing_cache`, `listing_observations`, `search_run_results`, `usage_events`. Rebuild `background_jobs` to add the `search_run_id` foreign key.
2. The restricted outbound HTTP client with SSRF checks at connection time (SEC-09), and `SecretStore` on the macOS Keychain (ADR-013).
3. Fixture connector with synthetic listings, then the Brave Search connector (D-027), then Freelancer.com and Upwork behind their approvals.
4. Manual search runs with the ADR-019 status model, cancellation, per-source outcomes, the cost preflight, and the Search page.
5. Phase 3 closes on fixtures (D-023); the live-source test is a separate gate.

**Needed from the owner before the live parts of Phase 3:** a Brave Search API key, and the status of the Upwork and Freelancer API applications.

## Open issues

None.

## Working location

The project lives at `~/Developer/freelance-opportunity-intelligence` on the owner's Mac. Claude builds and tests in its own workspace, then copies source files into that folder; the Mac's `node_modules` are never touched from Claude's Linux shell, because the native SQLite driver is built for macOS. After new files arrive, run `npm ci`, then `npm run rebuild:native` if dependencies changed, then `npm run check` and `npm start` on the Mac.

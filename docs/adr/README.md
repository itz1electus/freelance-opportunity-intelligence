# Architecture decision records

ADR-001 to ADR-022 are summarised in the architecture specification (§0 table) and, for v1.1.0, justified in [`../FOI_SPEC_REVIEW_2026-10-20.md`](../FOI_SPEC_REVIEW_2026-10-20.md). New decisions get their own file here, numbered from ADR-023, using the template in specification §12.1.

## Implementation notes recorded during Phase 1

These refine the specification without changing any decision; they are listed so a later session does not undo them by accident.

| Date | Note |
| --- | --- |
| 2026-10-20 | Migrations are hand-written SQL in `packages/infra/migrations/`, applied by a small forward-only migrator that checksums each file. drizzle-kit is not used (see `DEPENDENCIES.md`); `database.test.ts` checks the Drizzle schema against the migrated tables. |
| 2026-10-20 | `background_jobs.search_run_id` has no foreign key yet. The Phase 3 migration that creates `search_runs` must rebuild the table to add it. |
| 2026-10-20 | The worker runs inside the API process (ADR-021). Lease length 30 s, renewed every 10 s; retries back off 1 s, 2 s, 4 s … up to 60 s with ±20% jitter. |
| 2026-10-20 | `npm run open` authenticates to the running server with a per-start random key in `data/.runtime/server.json` (0600). See `SECURITY.md`. |
| 2026-10-20 | TypeScript is held at 6.0.x because typescript-eslint 8.72 does not support 6.1 or 7.x. ESLint 10 is used; eslint-plugin-react is replaced by a `no-restricted-syntax` rule. |
| 2026-10-20 | Internal packages export their TypeScript source; the server runs through `tsx` and the web app through Vite, so there is no separate compile step. |

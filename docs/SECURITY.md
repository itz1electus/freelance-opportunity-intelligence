# FOI security model (PROC-05)

FOI runs on one Mac for one operator, but it holds partner profiles, private notes and, from Phase 3, marketplace and AI credentials. This page lists what is protected, where the trust boundaries are, and which controls exist today.

## Assets

| Asset | Where it lives | Protection |
| --- | --- | --- |
| Partner profiles, notes, pipeline | `data/foi.sqlite`; text export in `data/shared/` | Folder permissions 0700, files 0600; FileVault; shared export only in the private repository |
| Provider credentials and OAuth tokens (Phase 3+) | macOS Keychain | Never in config, database, logs, `data/shared/` or the browser |
| Sessions | Browser cookie; SHA-256 hash in the database | HttpOnly, SameSite=Strict, Path=/api, install-unique name, 12-hour idle timeout |
| Monthly budget | Settings and usage ledger | Hard cap of $30 enforced before every paid call (Phase 3+) |
| Listing text from marketplaces | Local cache with per-source time limits | Never committed; purged on expiry (Phase 3+) |

## Trust boundaries

1. **Browser ↔ FOI API.** Every localhost port is the same "site", so cookies alone do not separate FOI from other local apps. FOI therefore requires, in this order: an exact `Host`; a `Sec-Fetch-Site` that is not `cross-site` or `same-site`; and for every state-changing request an exact `Origin` plus the `X-FOI-Request: 1` header. Every API route except health, setup status and sign-in needs a session, reads included.
2. **FOI ↔ outside world (Phase 3+).** All outbound requests go through one restricted HTTP client that refuses private, loopback and link-local addresses at connection time. Lint forbids `fetch` and `node:https` anywhere else in server code.
3. **FOI ↔ AI vendor (Phase 4+).** Listing text is untrusted. Model output is rendered as plain text, never HTML or remote images, and claims about a listing are checked against quoted text.
4. **Repository ↔ GitHub.** Only `data/shared/` and source code are committed. A pre-commit check blocks databases, logs, environment files and key-shaped strings.

## Controls in place at Phase 1

| Control | Where | Test |
| --- | --- | --- |
| Loopback-only listener; bind settings ignored | `packages/infra/src/config.ts` | P1-11 |
| Host, Fetch Metadata, Origin and custom-header checks | `apps/server/src/security/guards.ts` | P1-04, P1-08 |
| Session required on every API route, reads included | `guards.ts` | P1-03, P1-09 |
| One-time launch tokens; hashed server-side sessions | `security/launch-tokens.ts`, `security/sessions.ts` | P1-10, P1-15 |
| Strict CSP and security headers on every response | `guards.ts` | security.test.ts |
| No inline scripts in the web build | `apps/web/vite.config.ts` | build output check |
| Append-only audit log (database triggers) | `migrations/0001_foundation.sql` | database.test.ts |
| Idempotency keys for repeat-safe requests | `application/idempotency.ts` | P1-14 |
| Allowlisted log fields; bodies, tokens and listing text never logged | `packages/infra/src/logging.ts` | config.test.ts |
| Data folder permissions; synced-folder warning | `packages/infra/src/paths.ts` | P1-12 |
| Pre-commit check | `scripts/check-committable.mjs` | P1-13 |
| Install scripts disabled; exact pins; dependency allowlist | `.npmrc`, `docs/DEPENDENCIES.md` | P7-12 (manual until then) |

## The `npm run open` key

`npm start` writes `data/.runtime/server.json` (permissions 0600) holding a random key that lets `npm run open` mint a new sign-in link. Anything that can read your files as your macOS user can already read the database directly, so this adds no new exposure. The file is deleted when FOI stops, and the key changes on every start.

## Reporting a problem

Record security findings in `docs/PROGRESS.md` under "Open issues" with the date, what you observed and how to reproduce it. Do not paste credentials or real listing data into the note.

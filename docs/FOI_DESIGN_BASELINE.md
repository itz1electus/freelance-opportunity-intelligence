---
document_id: FOI-DESIGN-001
title: Freelance Opportunity Intelligence — Product and Architecture Design Baseline
version: 1.1.0
status: FROZEN — confirmed requirements with separately identified proposed defaults
supersedes: 1.0.0
as_of: 2026-10-20
owners: Two-partner freelance studio; operated by one person
related_specification: ./FOI_ARCHITECTURE_SPECIFICATION.md
---

# Freelance Opportunity Intelligence (FOI)
## Product and Architecture Design Baseline

**Version:** 1.1.0 (frozen)  
**Date:** 20 October 2026 (v1.0.0 and v1.1.0)  
**Status:** Design baseline. This document separates the user's confirmed requirements from implementer-proposed, configurable defaults and from dependencies that cannot be guaranteed before provider approval/testing.  
**Companion:** [`FOI_ARCHITECTURE_SPECIFICATION.md`](./FOI_ARCHITECTURE_SPECIFICATION.md). The companion contains implementable schemas, API and TypeScript contracts, state machines, and verification criteria.

> **Instructions for implementers and AI coding agents:** Preserve the decisions explicitly marked **CONFIRMED**. Do not convert **PROPOSED DEFAULTS** or **EXTERNAL DEPENDENCIES** into unchangeable requirements. Do not invent provider permissions, fields, candidate credentials, competitor counts, client reputations, delivery hours, or currency exchange rates. Produce a change proposal before making a design deviation. Never modify the existing Job Search Intelligence or CV Builder repositories as part of implementing FOI.

---

## 1. Executive summary

FOI is a **local-first, single-operator, manually triggered** web application that discovers freelance projects and contract opportunities, normalizes permitted source data, matches listings against the **combined capabilities of two partners**, ranks opportunities using distinct **technical compatibility** and **commercial feasibility** scores, and creates **technical assessments** automatically for qualifying high-scoring listings.

It supports opportunities from (a) freelance marketplaces and (b) direct company or project postings, not only conventional job boards. The system is a **freelance intelligence and decision-support tool**, **not** an auto-bidding platform, autonomous applicant, or project management suite.

FOI is an **independent repository and application** that may selectively port reviewed infrastructure and UI patterns from Job Search Intelligence (JSI). Its business domain, database, scoring, acquisition policy, and assessments are new. The existing personal CV builder is not a mandatory runtime dependency; its function can be revisited for later document export.

**Primary value proposition:** Shorten the time between discovering a legitimate freelance request and making an evidence-based decision about whether the studio can deliver it profitably and competitively.

## 2. Decision classification and authority

The following terms are normative throughout both files:

- **CONFIRMED:** Explicitly selected by the user; implement unless a later decision supersedes it.
- **PROPOSED DEFAULT:** Recommended starting parameter or implementation approach; changeable in Settings or at implementation time. It is **not** an explicit user approval of the precise number.
- **IMPLEMENTATION RULE:** A design constraint needed to make the confirmed objectives safe, correct, and testable (for example, no fabricated evidence).
- **EXTERNAL DEPENDENCY:** Needs provider approval, legal/commercial review, available API scope, or live technical validation.
- **DEFERRED:** Intentionally outside the MVP or expressly excluded.

### 2.1 Confirmed product decisions

| ID | Decision | Status | Consequence |
|---|---|---|---|
| D-001 | One operator uses the application at a time | CONFIRMED | No general multi-tenant account system, team roles, or collaboration layer in MVP. |
| D-002 | Two partners have individually editable capability profiles | CONFIRMED | Separate source-of-truth profiles for each partner. |
| D-003 | Opportunity matching uses **one combined studio capability** rather than separate displayed scores for each partner | CONFIRMED | One technical score per opportunity/studio-profile revision; provenance retained internally. |
| D-004 | Profiles are maintained through the FOI dashboard | CONFIRMED | FOI database, not CV YAML, owns partner and studio-capability data. |
| D-005 | Search freelance marketplaces **and** independent company/contract project postings | CONFIRMED | Different connectors and discovery modes under a common adapter interface. |
| D-006 | Search is **manual only** | CONFIRMED | No automated scheduled discovery; saved searches require operator initiation. |
| D-007 | Active accounts currently exist on Upwork and Freelancer.com; other accounts can be created | CONFIRMED (account intent) | Account existence does **not** imply API approval. |
| D-008 | Paid APIs, authorized aggregators, and LLM APIs may be used | CONFIRMED | Metered integrations allowed, subject to spend constraints. |
| D-009 | Monthly operating budget target **USD 20–30** | CONFIRMED | Usage ledger, preflight estimates, and budget enforcement required. |
| D-010 | Fixed-price advertised project threshold: **USD 300** | CONFIRMED | Configurable commercial screening rule. |
| D-011 | Hourly advertised rate threshold: **USD 20/hour** | CONFIRMED | Configurable commercial screening rule. |
| D-012 | Monthly retainer advertised threshold: **USD 500/month** | CONFIRMED | Configurable commercial screening rule. |
| D-013 | Combined delivery capacity **40–50 hours/week** | CONFIRMED | Capacity-aware feasibility model; each partner's availability editable. |
| D-014 | Technical compatibility matters **more** than commercial feasibility, but not overwhelmingly | CONFIRMED (relative priority) | Combined priority weighs capability somewhat more than feasibility. |
| D-015 | Competition is more important than client credibility in the feasibility assessment | CONFIRMED | Higher competition weight than reputation; never fabricate bidder data. |
| D-016 | Local hosting initially, possible AWS hosting later | CONFIRMED | Deployment-independent modules, single-host SQLite, no AWS runtime dependencies in MVP. |
| D-017 | Generate a technical assessment automatically for high-scoring opportunities | CONFIRMED | Threshold-gated, asynchronous, budget-limited assessment worker. |
| D-018 | FOI is a separate independent application; reuse only useful parts of JSI | CONFIRMED | Separate repository, database, settings, release cycle. |
| D-019 | Joint capability statements and any later client proposals must represent both partners | CONFIRMED | Shared-studio identity and evidence provenance. |
| D-020 | Remote access is not needed | CONFIRMED (v1.1.0) | The server binds to `127.0.0.1` only; no bind-host setting exists. |
| D-021 | The first LLM adapter targets the Anthropic Claude API | CONFIRMED (v1.1.0) | The adapter interface stays vendor-neutral; Anthropic's retention and training terms are recorded in the provider register before Phase 4. |
| D-022 | Hard monthly spending cap **USD 30**: $20 LLM, $5 search, $5 reserve | CONFIRMED (v1.1.0) | P-007 becomes confirmed; FOI never exceeds the cap automatically. |
| D-023 | If no marketplace API approval exists when Phase 3 code is finished, Phase 3 closes on fixtures | CONFIRMED (v1.1.0) | The live-source test becomes a separate gate; later phases do not wait for vendor approval. |
| D-024 | The repository is a local folder for now and moves to a private GitHub repository for trusted team members later | CONFIRMED (v1.1.0) | Nothing secret or rights-restricted may be committed. |
| D-025 | All FOI data lives inside the project folder under `data/`; team-owned data, including scores and assessments where source terms permit, is committed as text in `data/shared/` | CONFIRMED (v1.1.0) | Working database, listing cache, backups and logs are ignored by Git; full copies move as encrypted snapshots. |
| D-026 | macOS is the only supported platform for the MVP | CONFIRMED (v1.1.0) | Secrets live in each person's macOS Keychain. |
| D-027 | Brave Search API is the web-search provider | CONFIRMED (v1.1.0) | Within the $5 search allocation. |
| D-028 | Amounts in USD; English user interface | CONFIRMED (v1.1.0) | No currency conversion without a documented rate source. |

### 2.2 Proposed configurable defaults (not explicitly frozen numerical values)

| ID | Suggested initial value | Reason / interpretation |
|---|---|---|
| P-001 | Technical/commercial ranking weights **60% / 40%** | Material preference for capability without ignoring economics. |
| P-002 | Capability component weights: skills 40%, portfolio evidence 30%, analogous delivery experience 20%, service alignment 10% | Explainable technical rubric. |
| P-003 | Feasibility component weights: competition 30%, economics 25%, capacity/deadline 25%, scope clarity 15%, client credibility 5% | Reflect competition priority. |
| P-004 | Planning capacity baseline **45 combined hours/week**, sensitivity band 40–50 | Midpoint of confirmed range; may be changed. |
| P-005 | Automatic assessment gate: priority ≥80, capability ≥80, feasibility ≥60, no confirmed hard blocker, sufficient evidence | Avoid low-value expensive analysis. |
| P-006 | At most **5 automatic deep technical assessments per manual search run** | Cost control; on-demand override subject to budget. |
| P-007 | Monthly internal allocation: **$20 LLM + $5 search + $5 reserve** (at the $30 ceiling) | *Confirmed by D-022 in v1.1.0.* Not a guarantee of vendor affordability. |
| P-008 | Apply minimum advertised budgets to **gross advertised amounts**; show net estimates separately | Avoid conflating missing fees/tax with stated marketplace budget. |
| P-009 | React + TypeScript + Vite; Node.js + Hono; SQLite + Drizzle; local database-backed queue | Minimize infrastructure while preserving JSI strengths. |
| P-010 | Prioritize Freelancer.com official API, then Upwork after approval, then licensed web-search/direct-company connectors | Access-dependent integration order. |
| P-011 | Search-run results available incrementally; local API uses polling initially | Functional asynchronous UX without requiring SSE initially. |
| P-012 | Use configurable scoring policy thresholds and weights persisted in database | Easy calibration without code edits. |

**Frozen semantics:** Confirmed preferences and constraints must hold even if a proposed default is revised. For instance, any alternative ranking weights must still prioritize capability over feasibility, and the competition influence must remain materially larger than client credibility unless the user changes that preference.

## 3. Users, operating model, and deployment

- **Operator:** Exactly one human actively controls discovery, filtering, evaluation, and shortlist actions. No public sign-up, invitation, multi-tenancy, RBAC grid, or shared live-editing.
- **Partners:** Two distinct editable records. Profiles provide capability evidence; neither partner needs to log in.
- **Studio:** One derived combined capability representation with a version number and provenance back to its two constituent partner profiles.
- **Host:** A local Mac (D-026). A browser points to a local API and frontend on `127.0.0.1` only (D-020). API services and workers may continue running while the UI page is closed, **but no new discovery is scheduled**.
- **Team access (v1.1.0):** trusted team members clone the private repository and run their own local instance from `data/shared/` (D-024, D-025). Each person connects their own accounts; credentials are never shared through the repository.
- **Later AWS possibility:** Configuration, persistence adapters, secrets, and filesystem boundaries must be transportable. AWS deployment, cloud auth, managed queues, and PostgreSQL are not MVP deliverables.

### 3.1 Operating principles

1. Only a direct operator action starts a search run. A worker can continue a run already requested; automatic freshness re-search and recurring source polling are forbidden.
2. Previously retrieved opportunities are not assumed live forever. Show the last verification time. A manually triggered refresh or re-search may revalidate them where the provider allows.
3. One source failing must not erase other sources' valid results. Distinguish complete, partial, blocked, rate-limited, and failed source outcomes.
4. External listings are **untrusted content**, not instructions to the application, model, or shell.
5. Do not submit bids, proposals, or applications. If later requested, it requires an explicit new design phase and compliance review.

## 4. In-scope markets and offered services

Previous planning identified **UK/Europe and US clients** as priority markets. Do not enforce exclusion of other clients by default: this is a target preference, not a confirmed exclusive geography filter. Search must still respect actual marketplace account eligibility, jurisdictional restrictions, currencies, and required work authorization.

Initial services from prior planning:

1. Data analysis, data cleaning, dashboards, BI/reporting (Power BI, SQL, Excel, Python).
2. Machine learning, predictive modeling, classification, prototypes, and evaluation.
3. AWS cloud infrastructure and architecture.
4. Data engineering, ETL, automation, analytical pipelines.
5. Application deployment, hosting, DevOps/CI-CD as supported by actual evidence.
6. End-to-end development projects combining the above where deliverable capacity exists.

These are **initial taxonomy categories**, not claims that both partners individually have every skill. Skills, confidence, skill levels, demonstrations, portfolio URLs, available hours, and restrictions are entered independently for each partner. Do not infer missing partner skills from the categories or from a CV.

### 4.1 Partner profile minimum content

- Partner ID and display name (user-managed; do not embed names in code).
- Skill records: canonical skill ID, proficiency category, last-used/recency if known, descriptive notes.
- Service categories covered and specific deliverable types.
- Portfolio evidence: artifact/project ID, ownership (Partner A/Partner B/both), technology tags, outcomes and public URLs if any.
- Experience notes and verifiable qualifications; missing fields remain unknown.
- Weekly personal availability and limitations; studio-level total cap 40–50/week.
- Explicit exclusions or specialized constraints (e.g., unavailable tools, unavailable credentials).
- Profile version and timestamp.

### 4.2 Combined profile computation

Compute an immutable studio snapshot whenever either partner's profile changes:

- Union of demonstrated skills and offered services, preserving which partner supports each skill.
- Evidence index pointing to partner projects and joint projects, without double-counting repeated proof.
- Capacity by skill/partner, not just a single 45-hour unrestricted pool.
- Shared business identity for technical assessments and future proposals.
- Explicit unknowns or conflicting claims surfaced to the editor.

**One displayed score** is produced against this derived studio snapshot. Internal reasoning may refer to partner-specific task assignment to avoid treating capacity or proficiency as infinitely fungible.

## 5. Search and discovery requirements

### 5.1 Discovery categories

1. **Freelance marketplaces:** Upwork and Freelancer.com are initial account holders; others only through authorized access paths, not unauthorized browser scraping.
2. **Direct company and contract opportunities:** Searches of the public web using a licensed search API; eligible company-specific ATS/board APIs or permitted feeds where available.
3. **Manual capture/import:** An operator may submit an external URL/text where lawful, with source attribution. This is a fallback and separate from programmatic acquisition.

**EXTERNAL DEPENDENCY:** Accounts alone do not grant API rights. Provider API approvals, scopes, rate limits, field availability, costs, attribution requirements, and content retention rights must be validated per provider and stored in the source registry before live use.

### 5.2 Manual search experience

- Search terms, synonyms, services, and optional explicit negatives.
- Source selectors; engagement type selectors: fixed, hourly, retainer, unknown.
- Budget threshold controls; user may override defaults per run without changing global settings.
- Geographic eligibility and target-market filters.
- Optional date/recency, language, and source-specific constraints when supported.
- Saved presets for repeated **manual** execution; they never become scheduled tasks.
- A run summary with per-source counts, warnings, spend, completion, and failures.
- Incrementally view results while a run remains active.
- Restart/refresh is a new user-initiated search run; only retry/resume work already requested happens automatically.

### 5.3 Data acquisition pipeline

```text
Operator action
  -> Validate query, source authorization, cost headroom
  -> Create SearchRun and enqueue work
  -> Source-specific fetch and pagination
  -> Record explicit fetch completeness
  -> Normalize supported fields and provenance
  -> Deduplicate by (source, external ID) and conservative cross-source links
  -> Apply provider retention policies
  -> Deterministic eligibility and commercial filters
  -> Structured quick capability/commercial assessment
  -> Rank and annotate uncertainty
  -> Auto-generate limited technical assessments for qualified leads
  -> Present durable run outcome, including partial success
```

If data is absent, mark `unknown`; do not set an unsupported zero, neutral, high-confidence score, competitor count, experience claim, or client rating.

### 5.4 Marketplace and search integration considerations

- **Upwork:** Official GraphQL API documents `marketplaceJobPostingsSearch` with permission requirements. Operator-initiated search aligns with the documented search context. Approval and appropriate permission scopes remain required.
- **Freelancer.com:** Official developer SDK and examples support authorized project search via authenticated API. A Python SDK existing does not force FOI to use Python; the Node adapter can call an official HTTPS API where approved/documented.
- **Web search:** A licensed web search API is suitable for finding direct company requests; links discovered via search are **unverified leads**, not confirmed live contracts.
- **Other platforms:** Connect only after proving an authorized retrieval route and acceptable storage behavior.
- **JSI ATS providers:** Port only those legitimately useful for contract project opportunities. Most conventional full-time employer ATS connectors should not be carried over.

Provider rules take priority over convenience. Each adapter must declare permitted acquisition modes, data-retention constraints, LLM-sharing permission if applicable, and attribution requirements. The application must prevent accidental violation by design.

## 6. Opportunity data model (conceptual)

Every canonical opportunity may have one or more source listings. Keep source-specific facts separate from studio-owned workflow state and assessments:

- **Identity:** canonical opportunity ID; source ID, external listing ID, URL, origin, first/last observed timestamps.
- **Opportunity facts (when available/permitted):** title, client description, task list, required skills, contract type, budget range, currency, posted date, deadline, duration, time zone or location restriction.
- **Competitive signals:** proposal/bid count or bucket, public activity signals, estimated market congestion where analytically justified, timestamp and uncertainty.
- **Credibility signals:** platform verification/reputation fields only when permitted and factually available; low weight.
- **Live/availability state:** open, closed, awarded, unknown; `unknown` is not `open`.
- **Computed fields:** service fit, capability score, feasibility score, priority, score confidence, eligibility blockers, reason codes, evaluation versions.
- **Operator-owned fields:** shortlist, private notes, selected status, decisions, assessment feedback.
- **Rights-aware storage:** temporary source payloads may expire; persistent internal IDs and operator-authored notes are governed separately.

**De-duplication rule:** Prefer stable `(provider, external ID)` or canonical URL keys. Never merge different clients' projects solely because their titles or descriptions are similar. Similarity detection may flag likely duplicates for manual review. Do not allow one source's partial response to mark another source's listing closed.

## 7. Screening, scoring, and decision logic

### 7.1 Deterministic eligibility before AI

The prefilter should classify each relevant rule as `pass`, `fail`, or `unknown`, including:

- Explicit geography or legal access restrictions.
- Mandatory certification or authorization and evidence that it is actually held.
- Requirement type (freelance/contract vs full-time employment).
- Published budget bands vs the $300/$20h/$500mo minima.
- Strict deadlines relative to partner-specific available capacity **only when facts support a determination**.
- Duplicates, obviously closed listings, and operator blocks.

For monetary bands: if the source's advertised **maximum** is below the configured minimum in the same currency and unit, it is definitively below threshold. If the range overlaps the threshold, preserve it as potentially eligible. If budget/currency/rate basis is missing, preserve an `unknown` state. Never convert currencies using assumed exchange rates; use a documented rate source/time if added later.

The user may inspect otherwise filtered listings by enabling an explicit diagnostic view.

### 7.2 Distinct evaluation dimensions

- **Capability compatibility (C):** Skills (40%), portfolio evidence (30%), similar delivery experience (20%), service alignment (10%).
- **Commercial feasibility (F):** Competition (30%), economics (25%), delivery capacity/deadline (25%), scope clarity (15%), client credibility (5%).
- **Combined priority (P), proposed:** `P = 0.60*C + 0.40*F`, where components are scored 0–100 and only computed when evidence suffices.

**Implementation rules:**

- Hard eligibility failure produces `ineligible`; a numerical score cannot override it.
- Unknown facts remain `unknown`. If the scoring policy computes a partial score from observed dimensions, its evidence coverage and uncertainty must be shown; do not implicitly fill missing dimensions with optimistic values.
- An LLM may extract/interpret facts and propose assessments, but must return structured evidence, missing requirements, and confidence indicators. Deterministic code validates eligibility, weighs dimensions, and applies score rules.
- Competition is a significant factor only when source-supported; missing bid counts must not be hallucinated. Competition is not a calibrated win-probability model.
- An LLM-estimated delivery effort must be marked as an **estimate with assumptions and ranges**, never client-provided fact. Individual per-partner workload restrictions override simplistic pooled hours.
- Track score provenance: opportunity/source revision, studio profile version, scoring policy version, model ID, timestamp, reasons, and data coverage.
- A changed listing, partner profile, or scoring policy invalidates the previously current score.

### 7.3 Commercial feasibility calculations

For fixed-price opportunities:

`estimated_effective_hourly = (advertised_project_revenue - known/estimated_platform_fees - estimated_direct_costs) / estimated_delivery_hours`

Report assumptions, ranges, and exclusions, including taxes, unpaid sales time, rework, and scope changes. Avoid claiming net profit or exact returns on incomplete inputs. For hourly listings, interpret hourly budgets directly; for retainers, normalize to explicitly stated monthly amounts and estimate hours required. Treat other cadences as unresolved until transformed using a documented basis.

### 7.4 Recommended ranking interpretation

Priority is an ordering aid, not a predicted chance of winning. The dashboard displays at least **Capability**, **Feasibility**, **Priority**, **Eligibility**, and **Evidence Confidence** as separate concepts. A compelling technical match with weak economics should not be mislabeled a universally strong opportunity.

## 8. Automatic technical assessment

After the quick assessment, qualifying leads are enqueued for a deeper technical report, subject to the spend cap and per-run assessment cap.

**Proposed gate:** `Priority ≥80`, `Capability ≥80`, `Feasibility ≥60`, no confirmed hard blocker, sufficient listing details, and budget headroom. Default maximum five automatic reports per manually started search. An operator can request an assessment separately if permitted by budget and provider policy.

The output contains:

1. Concise factual project summary, distinguishing stated requirements from interpretation.
2. Deliverables and acceptance/definition-of-done candidates.
3. Required technical capabilities and matched evidence from the two-person studio.
4. Proposed implementation strategy and optional technical architecture.
5. Work packages, estimated effort ranges, skill ownership, capacity and delivery assumptions.
6. Risks, dependencies, integration/security concerns, ambiguous requirements, and questions for the client.
7. Portfolio proof points (real indexed evidence only) and explicitly missing credentials/evidence.
8. Commercial observations: budget suitability, fees, effective rate range, competition signals, unknowns.
9. Recommendation: `pursue`, `review`, or `deprioritize`, with citations into the evidence records.
10. Provenance and freshness: listing revision, profile version, model, scoring version, assessment time.

**Safety and quality:** Model-generated text must not be treated as executable instructions. Validate machine-readable output against a strict schema, verify evidence references, enforce token/cost budgets, and mark the assessment `stale` if inputs change. AI must not invent partner qualifications, project completion evidence, pricing commitments, delivery dates, or source-specific statistics.

**Not MVP:** Automatic client-facing proposal generation, pricing quotation or contract output, marketplace bid submission, invoice generation, client messaging, and delivery project management.

## 9. Dashboard and interaction design

Preserve JSI's effective **three-column desktop feed** style while changing the content hierarchy:

- **Left:** search facets, service filters, budget thresholds, source filters, saved views.
- **Center:** opportunity title, source, compensation, contract type, posted/verified status, capability/feasibility/priority, eligibility, short reason.
- **Right:** details, source evidence, missing information, partner task coverage, competition, estimated effort, assessment status, shortlist action.

Top-level areas:

1. **Opportunities:** ranked feed, filtering, sorting, status and detail views.
2. **Search:** new manual searches, saved presets, per-source execution progress and run history.
3. **Assessments:** generated reports, stale badges, regenerate on demand.
4. **Profiles:** Partner A editor, Partner B editor, combined studio preview, evidence index.
5. **Pipeline:** shortlist and lightweight outcomes such as `discovered`, `shortlisted`, `reviewed`, `proposal_drafted`, `proposal_submitted`, `responded`, `negotiating`, `won`, `lost`, `archived` (many stages are manual records; FOI never submits).
6. **Settings & Sources:** API connections, provider rights/health, budgets, weights, retention, audit and error logs.

Search and evaluation status must be visible without requiring page refresh. Source freshness and data confidence must never be hidden behind a single ranking number. Preserve accessible interaction and responsive/mobile-friendly layouts where economical.

## 10. Architecture and boundaries

### 10.1 Architecture style

**Modular monolith**, not microservices. A native Node.js app serves a TypeScript REST API and React frontend, shares SQLite data with a local worker, and calls permitted external APIs and LLM endpoints. Keep modules isolated by contracts so platform adapters and storage can be replaced later.

Suggested modules: `api`, `auth`, `profiles`, `sources`, `search`, `normalization`, `opportunities`, `filters`, `scoring`, `assessments`, `pipeline`, `budgets`, `worker`, `storage`, and `web`.

**Deployment portability:** Keep storage paths configurable, maintain migrations, avoid hard-coded localhost in user-generated URLs, and do not couple business logic to macOS binaries or a CV builder. Bind the server to loopback only; remote access is out of scope (D-020). A future AWS deployment is a separate project with its own TLS and authentication design.

### 10.2 JSI reference analysis

The relevant private repositories were accessible through the connected GitHub integration:

- `itz1electus/Job-Search-Intelligence_2`, `main`, inspected tree commit `567a1bf58aa6cedaad2a09f60ddd8bc24a740551`.
- `itz1electus/personal-cv-builder_2`, `main`, inspected tree commit `297434c57d50efc24c1c746ebcb9e612e7a0448b`.

They are **design references**, not runtime dependencies. Inspection covered principal architectural source paths; it was not a full executed production validation or comprehensive test run.

**Reusable patterns:**

- `core/src/llm/`: structured LLM abstraction and model/usage tracking approach.
- `core/src/net/`: public-address and guarded-network abstractions, subject to independent review.
- `core/src/providers/`: provider adapters and explicit partial-fetch snapshots.
- `server/src/jobs/`: database queue/worker and run bookkeeping, with revised job identities.
- `server/src/db/`: Drizzle/SQLite patterns, new FOI schema.
- `web/src/components/feed/` and `web/src/components/layout/`: multi-panel results and navigation patterns.
- `web/src/pages/`: operations, settings, run history, profile editing patterns.

**Do not copy without redesign:**

- Traditional employment role-title matching and salary/range semantics.
- Job-score prompt schemas or the one-best-role fallback.
- Single `jobs` record that mixes source identity, listing content, and workflow.
- Employment lifecycle semantics (`applied`, `interview`, `offer`, `hired`).
- Mandatory CV builder writeback or LaTeX generation.
- Large ATS registry unrelated to freelance/contract projects.

**Regression requirements inherited from JSI reviews:**

- Strict outbound HTTP/Chromium SSRF and DNS/redirect validation; block unsafe IP literals and private resolutions.
- A partial source result must never imply that unseen records were closed.
- Scores must invalidate when either listing content or a partner/scoring profile changes.
- Assessments must use the exact selected combined-profile revision and corresponding evaluation; no cross-profile contamination.
- Background job dedupe must represent **the complete work identity**, not the first record in a batch.
- Do not silently substitute one profile or role if an LLM chooses an invalid key.
- Do not expose API credentials in bookmarklets, frontend bundles, or external site scripts.
- Source extraction, client URLs, and project text are untrusted; avoid prompt injection and data exfiltration.

## 11. Security, privacy, and compliance

1. **Local-first does not mean unrestricted:** Bind to loopback, enforce exact host and origin checks, require a session on every API route (v1.1.0: reads included), and never emit permissive cross-origin headers. Every localhost port is the same site, so cookies alone do not isolate FOI from other local servers.
2. **External URL requests:** Only permit HTTP(S), block loopback/link-local/private/unroutable destinations, validate every redirect and the destination actually dialed, and enforce timeouts/body caps. Browser extraction, if ever enabled, needs the same network controls and source authorization.
3. **Secrets:** Keep API credentials and OAuth tokens in the macOS Keychain (v1.1.0), never in config files, the database, `data/shared/` or logs; redact logs and errors.
4. **Provider permissions:** Block a connector by default until allowed access method, field retention, attribution, and LLM processing permissions are documented. Permit expiry/purge by provider.
5. **Content trust:** Treat market listings as hostile text and validate LLM JSON with schemas. Keep tool permissions narrow; LLM must not autonomously send client communication.
6. **Personal/business information:** Limit sensitive profile storage, support backups/restores, protect export files, and document the data location: `<repo>/data/`, with only `data/shared/` committed to the private repository (D-025).
7. **Observability:** Log source outcomes and sanitized errors, evaluation model/tokens/cost, missing data, status transitions, and operator actions.

The product does **not** claim compliance with any platform merely because its connector is technically functional. Each source requires a pre-live authorization review.

## 12. Cost and operating constraints

- **Monthly target:** USD 20–30 including metered search APIs and LLM calls, with local hosting minimizing infrastructure charges.
- **Confirmed hard cap (D-022):** $30 per month: $20 LLM, $5 external search, $5 reserve.
- **Spend enforcement:** Track cost and estimated remaining budget by provider/month; preflight a call when feasible; stop initiating new paid calls when the selected cap would be breached, while preserving previously retrieved results.
- **Batch processing:** Deterministic prefilters and inexpensive extraction before LLM; quick-scoring before expensive assessment; deduplicate evaluations by input versions and policy.
- **Usage caveats:** Price lists, free credits, marketplace fees, account tiers, token prices, and API approvals are external dependencies and may change. No $30 service-cost guarantee is made without real usage measurements.
- **Override policy:** The operator may adjust budget settings explicitly. Automatic exceeding of the configured hard cap is forbidden.

## 13. Roadmap and release boundaries

| Phase | Deliverable | Exit criterion |
|---|---|---|
| 1 | Architecture, contracts, security policies, codebase foundation | App, DB migrations, API/worker skeleton run with fixtures locally. |
| 2 | Partner editors and studio profile | Editing one partner increments combined version and flags dependent evaluations stale. |
| 3 | Authorized acquisition and search runs | Fixture-backed multi-source search with partial failures isolated. A live approved source is a separate gate that later phases do not wait for (D-023). |
| 4 | Filters and scoring | Stable test scores, blocker logic, transparent missing data and costs. |
| 5 | AI technical assessments | Only qualifying results auto-assessed, correct evidence, no overspend. |
| 6 | Complete dashboard and shortlist | Entire manual search-to-assessment-to-shortlist flow works through UI. |
| 7 | Hardening and release | Security, retention, retry, migration/restore, and regression tests pass. |

The implementation-grade acceptance cases and detailed test names are maintained in the companion architecture specification.

### 13.1 Explicit non-goals / deferred work

- Automatically submitted applications, marketplace bids, or client messages.
- Autonomous agent browsing, platform scraping that lacks permission, account automation, circumvention of site controls.
- Scheduled searches, persistent autonomous monitoring, or automatic daily refresh.
- Multi-user cloud SaaS, partner logins, workspaces, RBAC, subscriptions, billing customers.
- Contract/invoice creation, payment collection, delivery project boards, accounting or tax computations.
- Mandatory integration with JSI or its CV builder; any CV/PDF exports are optional future features.
- Training win-probability machine learning models from insufficient or unrepresentative historical outcomes.
- AWS deployment in MVP.

## 14. Open external dependencies and nonblocking configuration choices

**Must be resolved before each live connector is enabled:**

- Source account approval, API scopes, data access route, allowed caching/retention/derived storage, LLM disclosure/sharing rules, attribution, operational rate limits.
- API billing details, token price schedule, and whether source-specific provider fees fit the monthly budget.
- Concrete source payload samples/fixtures demonstrating actual available budget, competition, time, and client fields.

**Can be revised in Settings without changing fundamental architecture:**

- Exact 60/40 weight and nested dimension weights.
- Assessment score thresholds and number per run.
- Whether thresholds use gross advertised amounts, net estimates, or both (the current proposal is gross screening plus net display).
- Each partner's weekly hours and the 45-hour planning baseline.
- Default saved search categories, filters, keywords, and target geographies.
- Local session timeout, data retention windows *within* each provider's allowed limits, and UI sort preferences.

**Not assumed:** In which country either partner is legally able to contract; marketplace API permission based solely on having an account; skill possession without profile evidence; fixed competition counts when the source lacks them; guaranteed exchange conversion, delivery schedule, or proposed fee.

## 15. Guidance for implementation and independent review

1. Read **this document first**, then the [architecture specification](./FOI_ARCHITECTURE_SPECIFICATION.md) v1.1.0, whose §16 is normative. The rationale for v1.1.0 changes is in [`FOI_SPEC_REVIEW_2026-10-20.md`](./FOI_SPEC_REVIEW_2026-10-20.md).
2. Start from a new repository; preserve the two JSI reference repositories unchanged.
3. Code the domain contracts and migrations before adding integrations or UI workflows.
4. Implement provider adapters using recorded, permitted fixtures and confirm real permissions independently.
5. Separate deterministic scoring orchestration from LLM extraction/interpretation so the same saved fixtures produce stable results under a fixed policy.
6. Test source completeness, provenance, data retention, concurrent run isolation, refresh/staleness, score/assessment alignment, and cost exhaustion before enabling live connectors.
7. For ambiguity, record an assumption/ADR rather than silently changing the user-confirmed design.
8. Never substitute a fake connector with invented real search results. Label fixture mode.

### 15.1 Reference material (verification starting points; provider terms change)

- Upwork developer portal: https://www.upwork.com/developer
- Upwork GraphQL schema/docs: https://www.upwork.com/developer/documentation/graphql/api/docs/index.html
- Freelancer developer portal: https://developers.freelancer.com/
- Freelancer official SDK and search example: https://github.com/freelancer/freelancer-sdk-python and https://github.com/freelancer/freelancer-sdk-python/blob/master/examples/search_projects.py
- Brave Search API pricing/documentation: https://brave.com/search/api/ and https://api-dashboard.search.brave.com/documentation/pricing
- Private reference repositories: https://github.com/itz1electus/Job-Search-Intelligence_2 and https://github.com/itz1electus/personal-cv-builder_2

---

## 16. Change log

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-20 | Frozen. Added owner decisions D-020 to D-028; P-007 confirmed; host, security, cost and roadmap Phase 3 exit criterion updated. |
| 1.0.0 | 2026-10-20 | Initial baseline. |

---

**Governance:** Changes to a confirmed requirement require an explicit owner decision and version bump. Changes to implementation details should update an Architecture Decision Record (ADR) and the companion specification. Keep this baseline focused on *what must be true* and the technical specification focused on *how to implement and verify it*.

# ADR-023: Portfolio evidence is a studio-level resource

- **Status:** Accepted
- **Date:** 2026-10-21
- **Decision owner:** Implementation (Phase 2); no CONFIRMED decision changes
- **Related requirements:** D-019, spec §2.2 `partner_evidence`, §7.2, P2-03

## Context

Spec §7.2 lists evidence routes under a partner (`POST /partners/:id/evidence`, `PATCH /partners/:id/evidence/:evidenceId`). Spec §2.2 also says one evidence item may credit both partners, each with their own attribution, and P2-03 requires joint proof to count once. Under per-partner routes, a joint project would be created through one partner and then attached to the other. That makes "who owns this item" ambiguous and invites duplicate entries.

## Decision

Evidence lives at `/api/v1/evidence`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/evidence` | All evidence with credits |
| `POST` | `/evidence` | Create; body includes `credits: [{ partnerId, contributionNotes }]` (one or two) |
| `PUT` | `/evidence/:id` | Replace all fields, including credits |
| `DELETE` | `/evidence/:id` | Delete; credits and skill tags go with it |

Credits are stored in `partner_evidence`, skill tags in `evidence_skills` (with a foreign key to `skills`). Saving identical content is a no-op, so timestamps and shared files stay stable.

## Alternatives considered

- **Per-partner routes as listed in §7.2:** rejected for the ambiguity above.
- **PATCH semantics:** the evidence form always submits every field, so a full replace is simpler and leaves no partial states.

## Consequences

- Spec §7.2's three evidence rows are superseded by the table above (recorded in spec v1.1.1 §16).
- Each evidence item is one file in `data/shared/evidence/<id>.json`, so two teammates editing different items do not conflict in Git.

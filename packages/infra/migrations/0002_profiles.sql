-- Phase 2: partner profiles, taxonomy, evidence and studio revisions (spec v1.1.0 §2.2).
-- Forward-only. Taxonomy rows are seeded by application code (INSERT OR IGNORE), not here,
-- so the vocabulary can grow without editing an applied migration.

CREATE TABLE skills (
  key            TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 60),
  label          TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  category       TEXT NOT NULL,
  origin         TEXT NOT NULL CHECK (origin IN ('seed', 'operator')),
  created_at_ms  INTEGER NOT NULL
);

CREATE TABLE skill_aliases (
  alias_normalized  TEXT PRIMARY KEY,
  skill_key         TEXT NOT NULL REFERENCES skills(key) ON DELETE CASCADE,
  origin            TEXT NOT NULL CHECK (origin IN ('seed', 'operator'))
);
CREATE INDEX idx_skill_aliases_skill ON skill_aliases(skill_key);

CREATE TABLE services (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL,
  search_taxonomy_json  TEXT NOT NULL DEFAULT '[]',
  enabled               INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order            INTEGER NOT NULL
);

-- Partners are rows with an active flag (SPEC-09); the application keeps exactly two active.
CREATE TABLE partners (
  id                   TEXT PRIMARY KEY,
  slot                 TEXT NOT NULL CHECK (slot IN ('A', 'B')),
  display_name         TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  weekly_hours         INTEGER CHECK (weekly_hours IS NULL OR weekly_hours BETWEEN 0 AND 80),
  exclusions_json      TEXT NOT NULL DEFAULT '[]',
  qualifications_json  TEXT NOT NULL DEFAULT '[]',
  notes                TEXT,
  active               INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  profile_version      INTEGER NOT NULL DEFAULT 1 CHECK (profile_version > 0),
  created_at_ms        INTEGER NOT NULL,
  updated_at_ms        INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_partners_active_slot ON partners(slot) WHERE active = 1;

CREATE TABLE partner_skills (
  id                   TEXT PRIMARY KEY,
  partner_id           TEXT NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  canonical_skill_key  TEXT NOT NULL REFERENCES skills(key) ON DELETE RESTRICT,
  proficiency          TEXT NOT NULL CHECK (proficiency IN ('foundational', 'working', 'advanced', 'expert')),
  last_used_year       INTEGER CHECK (last_used_year IS NULL OR last_used_year BETWEEN 1980 AND 2100),
  notes                TEXT,
  updated_at_ms        INTEGER NOT NULL,
  UNIQUE (partner_id, canonical_skill_key)
);

CREATE TABLE partner_services (
  partner_id         TEXT NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  service_id         TEXT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  deliverables_json  TEXT NOT NULL DEFAULT '[]',
  limitations        TEXT,
  updated_at_ms      INTEGER NOT NULL,
  PRIMARY KEY (partner_id, service_id)
);

CREATE TABLE portfolio_evidence (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  evidence_type   TEXT NOT NULL CHECK (evidence_type IN
                    ('client_project', 'employment_project', 'personal_project', 'open_source', 'publication', 'course_project')),
  source_url      TEXT,
  summary         TEXT,
  claims_json     TEXT NOT NULL DEFAULT '[]',
  verified_level  TEXT NOT NULL CHECK (verified_level IN ('self_reported', 'public_link', 'client_confirmed')),
  created_at_ms   INTEGER NOT NULL,
  updated_at_ms   INTEGER NOT NULL
);

CREATE TABLE evidence_skills (
  evidence_id  TEXT NOT NULL REFERENCES portfolio_evidence(id) ON DELETE CASCADE,
  skill_key    TEXT NOT NULL REFERENCES skills(key) ON DELETE RESTRICT,
  PRIMARY KEY (evidence_id, skill_key)
);

-- One evidence item may credit both partners, each with their own attribution (spec §2.2).
CREATE TABLE partner_evidence (
  partner_id          TEXT NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  evidence_id         TEXT NOT NULL REFERENCES portfolio_evidence(id) ON DELETE CASCADE,
  contribution_notes  TEXT,
  PRIMARY KEY (partner_id, evidence_id)
);
CREATE INDEX idx_partner_evidence_evidence ON partner_evidence(evidence_id);

-- Immutable snapshots (ADR-005). Revision numbers are local to this machine;
-- id, content_hash and material_hash are the same on every machine.
CREATE TABLE studio_profile_revisions (
  id                      TEXT PRIMARY KEY,
  revision                INTEGER NOT NULL UNIQUE CHECK (revision > 0),
  combined_snapshot_json  TEXT NOT NULL,
  content_hash            TEXT NOT NULL,
  material_hash           TEXT NOT NULL,
  change_summary_json     TEXT NOT NULL DEFAULT '{}',
  created_at_ms           INTEGER NOT NULL
);
CREATE INDEX idx_studio_revisions_material ON studio_profile_revisions(material_hash);

CREATE TRIGGER studio_revisions_no_update BEFORE UPDATE ON studio_profile_revisions
BEGIN SELECT RAISE(ABORT, 'studio profile revisions are immutable'); END;
CREATE TRIGGER studio_revisions_no_delete BEFORE DELETE ON studio_profile_revisions
BEGIN SELECT RAISE(ABORT, 'studio profile revisions are immutable'); END;

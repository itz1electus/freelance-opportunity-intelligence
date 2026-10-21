/**
 * Drizzle table definitions for typed queries. The SQL files in ../../migrations
 * are what create the tables; a test checks the two agree (SPEC-04, PROC-01).
 */
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  version: integer('version').notNull().default(1),
  updatedAtMs: integer('updated_at_ms').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    createdAtMs: integer('created_at_ms').notNull(),
    lastSeenAtMs: integer('last_seen_at_ms').notNull(),
    expiresAtMs: integer('expires_at_ms').notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('idx_sessions_expiry').on(t.expiresAtMs)],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    atMs: integer('at_ms').notNull(),
    action: text('action').notNull(),
    subjectType: text('subject_type'),
    subjectId: text('subject_id'),
    detailsJson: text('details_json').notNull().default('{}'),
    requestId: text('request_id'),
  },
  (t) => [index('idx_audit_at').on(t.atMs)],
);

export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code').notNull(),
    responseJson: text('response_json').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    expiresAtMs: integer('expires_at_ms').notNull(),
  },
  (t) => [index('idx_idempotency_expiry').on(t.expiresAtMs)],
);

export const backgroundJobs = sqliteTable(
  'background_jobs',
  {
    id: text('id').primaryKey(),
    searchRunId: text('search_run_id'),
    jobType: text('job_type').notNull(),
    payloadJson: text('payload_json').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'] }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    cancelRequested: integer('cancel_requested', { mode: 'boolean' }).notNull().default(false),
    leaseOwner: text('lease_owner'),
    leaseUntilMs: integer('lease_until_ms'),
    runAfterMs: integer('run_after_ms').notNull(),
    resultJson: text('result_json'),
    lastError: text('last_error'),
    createdAtMs: integer('created_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
    completedAtMs: integer('completed_at_ms'),
  },
  (t) => [index('idx_jobs_status_lease').on(t.status, t.leaseUntilMs), index('idx_jobs_ready').on(t.status, t.runAfterMs)],
);

// Phase 2: profiles (migrations/0002_profiles.sql)

export const skills = sqliteTable('skills', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  category: text('category').notNull(),
  origin: text('origin', { enum: ['seed', 'operator'] }).notNull(),
  createdAtMs: integer('created_at_ms').notNull(),
});

export const skillAliases = sqliteTable(
  'skill_aliases',
  {
    aliasNormalized: text('alias_normalized').primaryKey(),
    skillKey: text('skill_key')
      .notNull()
      .references(() => skills.key, { onDelete: 'cascade' }),
    origin: text('origin', { enum: ['seed', 'operator'] }).notNull(),
  },
  (t) => [index('idx_skill_aliases_skill').on(t.skillKey)],
);

export const services = sqliteTable('services', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  searchTaxonomyJson: text('search_taxonomy_json').notNull().default('[]'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull(),
});

export const partners = sqliteTable('partners', {
  id: text('id').primaryKey(),
  slot: text('slot', { enum: ['A', 'B'] }).notNull(),
  displayName: text('display_name').notNull(),
  weeklyHours: integer('weekly_hours'),
  exclusionsJson: text('exclusions_json').notNull().default('[]'),
  qualificationsJson: text('qualifications_json').notNull().default('[]'),
  notes: text('notes'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  profileVersion: integer('profile_version').notNull().default(1),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
});

export const partnerSkills = sqliteTable(
  'partner_skills',
  {
    id: text('id').primaryKey(),
    partnerId: text('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'restrict' }),
    canonicalSkillKey: text('canonical_skill_key')
      .notNull()
      .references(() => skills.key, { onDelete: 'restrict' }),
    proficiency: text('proficiency', { enum: ['foundational', 'working', 'advanced', 'expert'] }).notNull(),
    lastUsedYear: integer('last_used_year'),
    notes: text('notes'),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (t) => [unique().on(t.partnerId, t.canonicalSkillKey)],
);

export const partnerServices = sqliteTable(
  'partner_services',
  {
    partnerId: text('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'restrict' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    deliverablesJson: text('deliverables_json').notNull().default('[]'),
    limitations: text('limitations'),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (t) => [primaryKey({ columns: [t.partnerId, t.serviceId] })],
);

export const portfolioEvidence = sqliteTable('portfolio_evidence', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  evidenceType: text('evidence_type').notNull(),
  sourceUrl: text('source_url'),
  summary: text('summary'),
  claimsJson: text('claims_json').notNull().default('[]'),
  verifiedLevel: text('verified_level').notNull(),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
});

export const evidenceSkills = sqliteTable(
  'evidence_skills',
  {
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => portfolioEvidence.id, { onDelete: 'cascade' }),
    skillKey: text('skill_key')
      .notNull()
      .references(() => skills.key, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.evidenceId, t.skillKey] })],
);

export const partnerEvidence = sqliteTable(
  'partner_evidence',
  {
    partnerId: text('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'restrict' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => portfolioEvidence.id, { onDelete: 'cascade' }),
    contributionNotes: text('contribution_notes'),
  },
  (t) => [primaryKey({ columns: [t.partnerId, t.evidenceId] }), index('idx_partner_evidence_evidence').on(t.evidenceId)],
);

export const studioProfileRevisions = sqliteTable(
  'studio_profile_revisions',
  {
    id: text('id').primaryKey(),
    revision: integer('revision').notNull().unique(),
    combinedSnapshotJson: text('combined_snapshot_json').notNull(),
    contentHash: text('content_hash').notNull(),
    materialHash: text('material_hash').notNull(),
    changeSummaryJson: text('change_summary_json').notNull().default('{}'),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (t) => [index('idx_studio_revisions_material').on(t.materialHash)],
);

export const tables = {
  appSettings,
  sessions,
  auditEvents,
  idempotencyKeys,
  backgroundJobs,
  skills,
  skillAliases,
  services,
  partners,
  partnerSkills,
  partnerServices,
  portfolioEvidence,
  evidenceSkills,
  partnerEvidence,
  studioProfileRevisions,
};

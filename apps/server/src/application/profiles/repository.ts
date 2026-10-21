/**
 * Read side of the profile data. Every function takes the SQLite handle so it
 * can run inside the caller's transaction.
 */
import type {
  EvidenceType,
  EvidenceView,
  PartnerServiceView,
  PartnerSkillView,
  PartnerSlot,
  PartnerView,
  Proficiency,
  Qualification,
  ServiceView,
  SkillView,
  StudioInput,
  StudioSnapshot,
  VerifiedLevel,
} from '@foi/domain';
import { DEFAULT_CAPACITY } from '@foi/domain';
import type Database from 'better-sqlite3';

const iso = (ms: number) => new Date(ms).toISOString();
const parse = <T>(json: string): T => JSON.parse(json) as T;

interface PartnerRow {
  id: string;
  slot: PartnerSlot;
  display_name: string;
  weekly_hours: number | null;
  exclusions_json: string;
  qualifications_json: string;
  notes: string | null;
  profile_version: number;
  created_at_ms: number;
  updated_at_ms: number;
}

interface EvidenceRow {
  id: string;
  title: string;
  evidence_type: EvidenceType;
  source_url: string | null;
  summary: string | null;
  claims_json: string;
  verified_level: VerifiedLevel;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface RevisionRow {
  id: string;
  revision: number;
  combined_snapshot_json: string;
  content_hash: string;
  material_hash: string;
  change_summary_json: string;
  created_at_ms: number;
}

export function activePartnerRows(sqlite: Database.Database): PartnerRow[] {
  return sqlite.prepare('SELECT * FROM partners WHERE active = 1 ORDER BY slot').all() as PartnerRow[];
}

export function isProvisioned(sqlite: Database.Database): boolean {
  return activePartnerRows(sqlite).length === 2;
}

export function studioWeeklyCap(sqlite: Database.Database): number {
  const row = sqlite.prepare("SELECT value_json FROM app_settings WHERE key = 'capacity'").get() as
    | { value_json: string }
    | undefined;
  const value = row ? (parse<{ studioWeeklyCapHours?: unknown }>(row.value_json).studioWeeklyCapHours ?? null) : null;
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_CAPACITY.studioWeeklyCapHours;
}

export function evidenceRows(sqlite: Database.Database): EvidenceView[] {
  const rows = sqlite.prepare('SELECT * FROM portfolio_evidence ORDER BY created_at_ms, id').all() as EvidenceRow[];
  const skills = sqlite.prepare('SELECT evidence_id, skill_key FROM evidence_skills ORDER BY skill_key').all() as Array<{
    evidence_id: string;
    skill_key: string;
  }>;
  const credits = sqlite
    .prepare(
      `SELECT pe.evidence_id, pe.partner_id, pe.contribution_notes
         FROM partner_evidence pe JOIN partners p ON p.id = pe.partner_id
        ORDER BY p.slot`,
    )
    .all() as Array<{ evidence_id: string; partner_id: string; contribution_notes: string | null }>;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.evidence_type,
    url: r.source_url,
    summary: r.summary,
    claims: parse<string[]>(r.claims_json),
    skillKeys: skills.filter((s) => s.evidence_id === r.id).map((s) => s.skill_key),
    verifiedLevel: r.verified_level,
    credits: credits
      .filter((c) => c.evidence_id === r.id)
      .map((c) => ({ partnerId: c.partner_id, contributionNotes: c.contribution_notes })),
    createdAt: iso(r.created_at_ms),
    updatedAt: iso(r.updated_at_ms),
  }));
}

export function loadStudioInput(sqlite: Database.Database): StudioInput {
  const partners = activePartnerRows(sqlite);
  const partnerSkills = sqlite
    .prepare(
      `SELECT ps.partner_id, ps.canonical_skill_key, ps.proficiency, ps.last_used_year, ps.notes
         FROM partner_skills ps JOIN partners p ON p.id = ps.partner_id WHERE p.active = 1`,
    )
    .all() as Array<{
    partner_id: string;
    canonical_skill_key: string;
    proficiency: Proficiency;
    last_used_year: number | null;
    notes: string | null;
  }>;
  const partnerServices = sqlite
    .prepare(
      `SELECT ps.partner_id, ps.service_id, ps.deliverables_json, ps.limitations
         FROM partner_services ps JOIN partners p ON p.id = ps.partner_id WHERE p.active = 1`,
    )
    .all() as Array<{ partner_id: string; service_id: string; deliverables_json: string; limitations: string | null }>;
  const skillLabels = Object.fromEntries(
    (sqlite.prepare('SELECT key, label FROM skills').all() as Array<{ key: string; label: string }>).map((r) => [r.key, r.label]),
  );
  const serviceNames = Object.fromEntries(
    (sqlite.prepare('SELECT id, name FROM services').all() as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]),
  );
  return {
    partners: partners.map((p) => ({
      id: p.id,
      slot: p.slot,
      displayName: p.display_name,
      weeklyHours: p.weekly_hours,
      exclusions: parse<string[]>(p.exclusions_json),
      qualifications: parse<Qualification[]>(p.qualifications_json),
      notes: p.notes,
      profileVersion: p.profile_version,
    })),
    partnerSkills: partnerSkills.map((s) => ({
      partnerId: s.partner_id,
      skillKey: s.canonical_skill_key,
      proficiency: s.proficiency,
      lastUsedYear: s.last_used_year,
      notes: s.notes,
    })),
    partnerServices: partnerServices.map((s) => ({
      partnerId: s.partner_id,
      serviceId: s.service_id,
      deliverables: parse<string[]>(s.deliverables_json),
      limitations: s.limitations,
    })),
    evidence: evidenceRows(sqlite).map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      url: e.url,
      summary: e.summary,
      claims: e.claims,
      skillKeys: e.skillKeys,
      verifiedLevel: e.verifiedLevel,
      credits: e.credits,
    })),
    skillLabels,
    serviceNames,
    studioWeeklyCapHours: studioWeeklyCap(sqlite),
  };
}

export function partnerView(sqlite: Database.Database, id: string): PartnerView | null {
  const p = sqlite.prepare('SELECT * FROM partners WHERE id = ? AND active = 1').get(id) as PartnerRow | undefined;
  if (!p) return null;
  const skills = sqlite
    .prepare(
      `SELECT ps.canonical_skill_key AS skillKey, s.label, s.category, ps.proficiency, ps.last_used_year AS lastUsedYear,
              ps.notes, ps.updated_at_ms AS updatedAtMs,
              (SELECT COUNT(*) FROM partner_evidence pe JOIN evidence_skills es ON es.evidence_id = pe.evidence_id
                WHERE pe.partner_id = ps.partner_id AND es.skill_key = ps.canonical_skill_key) AS evidenceCount
         FROM partner_skills ps JOIN skills s ON s.key = ps.canonical_skill_key
        WHERE ps.partner_id = ?
        ORDER BY s.label COLLATE NOCASE`,
    )
    .all(id) as Array<Omit<PartnerSkillView, 'updatedAt'> & { updatedAtMs: number }>;
  const services = sqlite
    .prepare(
      `SELECT ps.service_id AS serviceId, sv.name, ps.deliverables_json, ps.limitations
         FROM partner_services ps JOIN services sv ON sv.id = ps.service_id
        WHERE ps.partner_id = ? ORDER BY sv.sort_order`,
    )
    .all(id) as Array<{ serviceId: string; name: string; deliverables_json: string; limitations: string | null }>;
  return {
    id: p.id,
    slot: p.slot,
    displayName: p.display_name,
    weeklyHours: p.weekly_hours,
    exclusions: parse<string[]>(p.exclusions_json),
    qualifications: parse<Qualification[]>(p.qualifications_json),
    notes: p.notes,
    profileVersion: p.profile_version,
    updatedAt: iso(p.updated_at_ms),
    skills: skills.map(({ updatedAtMs, ...s }) => ({ ...s, updatedAt: iso(updatedAtMs) })),
    services: services.map<PartnerServiceView>((s) => ({
      serviceId: s.serviceId,
      name: s.name,
      deliverables: parse<string[]>(s.deliverables_json),
      limitations: s.limitations,
    })),
  };
}

export function skillViews(sqlite: Database.Database): SkillView[] {
  const skills = sqlite.prepare('SELECT key, label, category, origin FROM skills ORDER BY label COLLATE NOCASE').all() as Array<
    Omit<SkillView, 'aliases'>
  >;
  const aliases = sqlite.prepare('SELECT alias_normalized, skill_key FROM skill_aliases ORDER BY alias_normalized').all() as Array<{
    alias_normalized: string;
    skill_key: string;
  }>;
  return skills.map((s) => ({ ...s, aliases: aliases.filter((a) => a.skill_key === s.key).map((a) => a.alias_normalized) }));
}

export function serviceViews(sqlite: Database.Database): ServiceView[] {
  const rows = sqlite.prepare('SELECT * FROM services ORDER BY sort_order').all() as Array<{
    id: string;
    name: string;
    description: string;
    search_taxonomy_json: string;
    enabled: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    searchTerms: parse<string[]>(r.search_taxonomy_json),
    enabled: r.enabled === 1,
  }));
}

export function latestRevision(sqlite: Database.Database): RevisionRow | null {
  return (sqlite.prepare('SELECT * FROM studio_profile_revisions ORDER BY revision DESC LIMIT 1').get() as RevisionRow | undefined) ?? null;
}

export function revisionById(sqlite: Database.Database, id: string): RevisionRow | null {
  return (sqlite.prepare('SELECT * FROM studio_profile_revisions WHERE id = ?').get(id) as RevisionRow | undefined) ?? null;
}

export const snapshotOf = (row: RevisionRow): StudioSnapshot => parse<StudioSnapshot>(row.combined_snapshot_json);

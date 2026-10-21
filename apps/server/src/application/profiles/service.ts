import { randomUUID } from 'node:crypto';
import {
  deriveStudioSnapshot,
  diffStudio,
  materialProjection,
  normalizeSkillName,
  partnerCompleteness,
  partnerProjection,
  skillKeyFromLabel,
  SKILL_KEY_PATTERN,
  type EvidenceInput,
  type EvidenceView,
  type PartnerPatch,
  type PartnerServiceInput,
  type PartnerSkillInput,
  type PartnerView,
  type RevisionView,
  type ServiceView,
  type SkillView,
  type StudioView,
} from '@foi/domain';
import type Database from 'better-sqlite3';
import type { z } from 'zod';
import type { NewSkillSchema, SetupPartnersSchema } from '@foi/domain';
import { recordAudit } from '../audit.ts';
import { AppError } from '../errors.ts';
import { hashCanonical } from '../hash.ts';
import {
  activePartnerRows,
  evidenceRows,
  isProvisioned,
  latestRevision,
  loadStudioInput,
  partnerView,
  serviceViews,
  skillViews,
  snapshotOf,
  type RevisionRow,
} from './repository.ts';

/** Lets the shared-file sync veto a change before it starts and export after it commits. */
export interface MutationHooks {
  beforeMutation(): void;
  afterCommit(): void;
}

const revisionView = (r: RevisionRow): RevisionView => ({
  id: r.id,
  revision: r.revision,
  createdAt: new Date(r.created_at_ms).toISOString(),
  contentHash: r.content_hash,
  materialHash: r.material_hash,
  changeSummary: JSON.parse(r.change_summary_json) as RevisionView['changeSummary'],
});

export interface RecomputeOptions {
  /** Importing shared files: keep the versions the files carry. */
  preserveVersions?: boolean;
  /** Reuse this revision ID when the content matches what another machine recorded. */
  expectedRevision?: { id: string; contentHash: string; createdAtMs: number } | null;
}

/**
 * Partner profiles and the combined studio profile (Phase 2). Every change runs
 * in one transaction that also bumps the affected partners' versions and
 * records a new immutable studio revision when the content changed.
 */
export class ProfileService {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly clock: () => number,
    private hooks: MutationHooks | null = null,
  ) {}

  setHooks(hooks: MutationHooks): void {
    this.hooks = hooks;
  }

  provisioned(): boolean {
    return isProvisioned(this.sqlite);
  }

  // ---------------------------------------------------------------- reads

  listPartners(): PartnerView[] {
    return activePartnerRows(this.sqlite).map((p) => partnerView(this.sqlite, p.id)!);
  }

  getPartner(id: string): PartnerView {
    const partner = partnerView(this.sqlite, id);
    if (!partner) throw new AppError(404, 'NOT_FOUND', 'No partner with that ID.');
    return partner;
  }

  listSkills(): SkillView[] {
    return skillViews(this.sqlite);
  }

  listServices(): ServiceView[] {
    return serviceViews(this.sqlite);
  }

  listEvidence(): EvidenceView[] {
    return evidenceRows(this.sqlite);
  }

  /** Resolves any common spelling to a canonical skill key, or null. */
  resolveSkill(name: string): string | null {
    const row = this.sqlite.prepare('SELECT skill_key FROM skill_aliases WHERE alias_normalized = ?').get(normalizeSkillName(name)) as
      | { skill_key: string }
      | undefined;
    return row?.skill_key ?? null;
  }

  studio(): StudioView {
    const latest = latestRevision(this.sqlite);
    if (!latest || !this.provisioned()) {
      throw new AppError(409, 'PROFILE_INCOMPLETE', 'Name both partners first.');
    }
    const snapshot = snapshotOf(latest);
    const since = this.sqlite
      .prepare(
        `SELECT MIN(created_at_ms) AS at FROM studio_profile_revisions
          WHERE revision > COALESCE((SELECT MAX(revision) FROM studio_profile_revisions WHERE material_hash <> ?), 0)`,
      )
      .get(latest.material_hash) as { at: number };
    return {
      revision: revisionView(latest),
      materialSince: new Date(since.at).toISOString(),
      snapshot,
      completeness: Object.fromEntries(snapshot.partners.map((p) => [p.id, partnerCompleteness(snapshot, p.id)])),
    };
  }

  revisions(limit: number): RevisionView[] {
    const rows = this.sqlite
      .prepare('SELECT * FROM studio_profile_revisions ORDER BY revision DESC LIMIT ?')
      .all(limit) as RevisionRow[];
    return rows.map(revisionView);
  }

  // ---------------------------------------------------------------- writes

  setup(input: z.infer<typeof SetupPartnersSchema>, requestId?: string): PartnerView[] {
    this.mutate('profile.partners_created', requestId, () => {
      if (activePartnerRows(this.sqlite).length > 0) {
        throw new AppError(409, 'ALREADY_EXISTS', 'The two partner profiles already exist.');
      }
      const now = this.clock();
      const insert = this.sqlite.prepare(
        'INSERT INTO partners (id, slot, display_name, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)',
      );
      insert.run(randomUUID(), 'A', input.partnerA.displayName, now, now);
      insert.run(randomUUID(), 'B', input.partnerB.displayName, now, now);
      return {};
    });
    return this.listPartners();
  }

  patchPartner(id: string, patch: PartnerPatch, requestId?: string): PartnerView {
    this.mutate('profile.partner_updated', requestId, () => {
      const current = this.requirePartner(id);
      if (patch.expectedProfileVersion !== undefined && patch.expectedProfileVersion !== current.profileVersion) {
        throw new AppError(409, 'VERSION_CONFLICT', 'This profile changed in another tab or window. Reload it and try again.', {
          currentProfileVersion: current.profileVersion,
        });
      }
      this.sqlite
        .prepare(
          `UPDATE partners SET display_name = ?, weekly_hours = ?, exclusions_json = ?, qualifications_json = ?, notes = ?
            WHERE id = ?`,
        )
        .run(
          patch.displayName ?? current.displayName,
          patch.weeklyHours === undefined ? current.weeklyHours : patch.weeklyHours,
          JSON.stringify(patch.exclusions ?? current.exclusions),
          JSON.stringify(patch.qualifications ?? current.qualifications),
          patch.notes === undefined ? current.notes : patch.notes,
          id,
        );
      return { subjectId: id };
    });
    return this.getPartner(id);
  }

  putSkill(partnerId: string, skillKey: string, input: PartnerSkillInput, requestId?: string): PartnerView {
    this.mutate('profile.skill_saved', requestId, () => {
      this.requirePartner(partnerId);
      this.requireSkill(skillKey);
      this.sqlite
        .prepare(
          `INSERT INTO partner_skills (id, partner_id, canonical_skill_key, proficiency, last_used_year, notes, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (partner_id, canonical_skill_key) DO UPDATE SET
             proficiency = excluded.proficiency, last_used_year = excluded.last_used_year, notes = excluded.notes,
             updated_at_ms = CASE WHEN partner_skills.proficiency IS excluded.proficiency
                                   AND partner_skills.last_used_year IS excluded.last_used_year
                                   AND partner_skills.notes IS excluded.notes
                                  THEN partner_skills.updated_at_ms ELSE excluded.updated_at_ms END`,
        )
        .run(randomUUID(), partnerId, skillKey, input.proficiency, input.lastUsedYear, input.notes, this.clock());
      return { subjectId: partnerId, skillKey };
    });
    return this.getPartner(partnerId);
  }

  deleteSkill(partnerId: string, skillKey: string, requestId?: string): PartnerView {
    this.mutate('profile.skill_removed', requestId, () => {
      this.requirePartner(partnerId);
      const removed = this.sqlite
        .prepare('DELETE FROM partner_skills WHERE partner_id = ? AND canonical_skill_key = ?')
        .run(partnerId, skillKey).changes;
      if (removed === 0) throw new AppError(404, 'NOT_FOUND', 'This partner does not list that skill.');
      return { subjectId: partnerId, skillKey };
    });
    return this.getPartner(partnerId);
  }

  putService(partnerId: string, serviceId: string, input: PartnerServiceInput, requestId?: string): PartnerView {
    this.mutate('profile.service_saved', requestId, () => {
      this.requirePartner(partnerId);
      if (!this.sqlite.prepare('SELECT 1 FROM services WHERE id = ?').get(serviceId)) {
        throw new AppError(404, 'NOT_FOUND', 'No service with that ID.');
      }
      this.sqlite
        .prepare(
          `INSERT INTO partner_services (partner_id, service_id, deliverables_json, limitations, updated_at_ms)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (partner_id, service_id) DO UPDATE SET
             deliverables_json = excluded.deliverables_json, limitations = excluded.limitations,
             updated_at_ms = CASE WHEN partner_services.deliverables_json IS excluded.deliverables_json
                                   AND partner_services.limitations IS excluded.limitations
                                  THEN partner_services.updated_at_ms ELSE excluded.updated_at_ms END`,
        )
        .run(partnerId, serviceId, JSON.stringify(input.deliverables), input.limitations, this.clock());
      return { subjectId: partnerId, serviceId };
    });
    return this.getPartner(partnerId);
  }

  deleteService(partnerId: string, serviceId: string, requestId?: string): PartnerView {
    this.mutate('profile.service_removed', requestId, () => {
      this.requirePartner(partnerId);
      const removed = this.sqlite
        .prepare('DELETE FROM partner_services WHERE partner_id = ? AND service_id = ?')
        .run(partnerId, serviceId).changes;
      if (removed === 0) throw new AppError(404, 'NOT_FOUND', 'This partner does not offer that service.');
      return { subjectId: partnerId, serviceId };
    });
    return this.getPartner(partnerId);
  }

  /** Adds a skill to the shared vocabulary. It is not a claim by either partner. */
  createSkill(input: z.infer<typeof NewSkillSchema>, requestId?: string): SkillView {
    const key = skillKeyFromLabel(input.label);
    if (!SKILL_KEY_PATTERN.test(key)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Use letters or digits in the skill name.');
    }
    this.mutate('taxonomy.skill_added', requestId, () => {
      const names = [...new Set([key, input.label, ...input.aliases].map(normalizeSkillName).filter((n) => n.length > 0))];
      for (const name of names) {
        const owner = this.sqlite.prepare('SELECT skill_key FROM skill_aliases WHERE alias_normalized = ?').get(name) as
          | { skill_key: string }
          | undefined;
        if (owner) {
          throw new AppError(409, 'ALREADY_EXISTS', 'That skill is already in the vocabulary.', { skillKey: owner.skill_key });
        }
      }
      if (this.sqlite.prepare('SELECT 1 FROM skills WHERE key = ?').get(key)) {
        throw new AppError(409, 'ALREADY_EXISTS', 'That skill is already in the vocabulary.', { skillKey: key });
      }
      this.sqlite
        .prepare("INSERT INTO skills (key, label, category, origin, created_at_ms) VALUES (?, ?, ?, 'operator', ?)")
        .run(key, input.label, input.category, this.clock());
      const alias = this.sqlite.prepare("INSERT INTO skill_aliases (alias_normalized, skill_key, origin) VALUES (?, ?, 'operator')");
      for (const name of names) alias.run(name, key);
      return { skillKey: key };
    });
    return this.listSkills().find((s) => s.key === key)!;
  }

  createEvidence(input: EvidenceInput, requestId?: string): EvidenceView {
    const id = randomUUID();
    this.mutate('evidence.created', requestId, () => {
      this.validateEvidence(input);
      const now = this.clock();
      this.sqlite
        .prepare(
          `INSERT INTO portfolio_evidence (id, title, evidence_type, source_url, summary, claims_json, verified_level, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, input.title, input.type, input.url, input.summary, JSON.stringify(input.claims), input.verifiedLevel, now, now);
      this.writeEvidenceLinks(id, input);
      return { subjectId: id };
    });
    return this.requireEvidence(id);
  }

  updateEvidence(id: string, input: EvidenceInput, requestId?: string): EvidenceView {
    const existing = this.requireEvidence(id);
    const comparable = (e: Omit<EvidenceView, 'id' | 'createdAt' | 'updatedAt'>) =>
      hashCanonical({ ...e, skillKeys: [...new Set(e.skillKeys)].sort(), credits: [...e.credits].sort((x, y) => (x.partnerId < y.partnerId ? -1 : 1)) });
    const { id: _id, createdAt: _c, updatedAt: _u, ...before } = existing;
    if (comparable(before) === comparable(input)) return existing;
    this.mutate('evidence.updated', requestId, () => {
      this.requireEvidence(id);
      this.validateEvidence(input);
      this.sqlite
        .prepare(
          `UPDATE portfolio_evidence SET title = ?, evidence_type = ?, source_url = ?, summary = ?, claims_json = ?,
                  verified_level = ?, updated_at_ms = ? WHERE id = ?`,
        )
        .run(input.title, input.type, input.url, input.summary, JSON.stringify(input.claims), input.verifiedLevel, this.clock(), id);
      this.sqlite.prepare('DELETE FROM evidence_skills WHERE evidence_id = ?').run(id);
      this.sqlite.prepare('DELETE FROM partner_evidence WHERE evidence_id = ?').run(id);
      this.writeEvidenceLinks(id, input);
      return { subjectId: id };
    });
    return this.requireEvidence(id);
  }

  deleteEvidence(id: string, requestId?: string): void {
    this.mutate('evidence.deleted', requestId, () => {
      this.requireEvidence(id);
      this.sqlite.prepare('DELETE FROM portfolio_evidence WHERE id = ?').run(id);
      return { subjectId: id };
    });
  }

  // ------------------------------------------------------------- internals

  /**
   * Runs one change: shared-file guard, then a single transaction holding the
   * change, version bumps, the studio revision and the audit event, then the
   * shared export once the transaction has committed.
   */
  private mutate(
    action: string,
    requestId: string | undefined,
    change: () => { subjectId?: string; skillKey?: string; serviceId?: string },
  ): void {
    this.hooks?.beforeMutation();
    this.sqlite
      .transaction(() => {
        const details = change();
        const { created } = this.recompute();
        recordAudit(
          this.sqlite,
          {
            action,
            subjectType: action.split('.')[0],
            subjectId: details.subjectId,
            details: {
              ...(details.skillKey ? { skillKey: details.skillKey } : {}),
              ...(details.serviceId ? { serviceId: details.serviceId } : {}),
              newStudioRevision: created,
            },
            requestId,
          },
          this.clock(),
        );
      })
      .immediate();
    this.hooks?.afterCommit();
  }

  /**
   * Rebuilds the studio snapshot. Partners whose own projection changed get a
   * new profile version; a new immutable revision is stored only when the
   * snapshot's content differs from the latest one.
   */
  recompute(options: RecomputeOptions = {}): { created: boolean; revisionId: string | null } {
    if (!isProvisioned(this.sqlite)) return { created: false, revisionId: null };
    const now = this.clock();
    const latest = latestRevision(this.sqlite);
    const previous = latest ? snapshotOf(latest) : null;
    let snapshot = deriveStudioSnapshot(loadStudioInput(this.sqlite));

    if (previous && !options.preserveVersions) {
      const bump = this.sqlite.prepare('UPDATE partners SET profile_version = profile_version + 1, updated_at_ms = ? WHERE id = ?');
      let bumped = false;
      for (const p of snapshot.partners) {
        const before = partnerProjection(previous, p.id);
        if (before === null || hashCanonical(before) !== hashCanonical(partnerProjection(snapshot, p.id))) {
          bump.run(now, p.id);
          bumped = true;
        }
      }
      if (bumped) snapshot = deriveStudioSnapshot(loadStudioInput(this.sqlite));
    }

    const contentHash = hashCanonical(snapshot);
    if (latest && latest.content_hash === contentHash) return { created: false, revisionId: latest.id };

    const expected = options.expectedRevision;
    const reuseId =
      expected && expected.contentHash === contentHash && !this.sqlite.prepare('SELECT 1 FROM studio_profile_revisions WHERE id = ?').get(expected.id)
        ? expected
        : null;
    const id = reuseId?.id ?? randomUUID();
    const next = (latest?.revision ?? 0) + 1;
    const summary = previous ? diffStudio(previous, snapshot) : { initial: true };
    this.sqlite
      .prepare(
        `INSERT INTO studio_profile_revisions
           (id, revision, combined_snapshot_json, content_hash, material_hash, change_summary_json, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        next,
        JSON.stringify(snapshot),
        contentHash,
        hashCanonical(materialProjection(snapshot)),
        JSON.stringify(summary),
        reuseId?.createdAtMs ?? now,
      );
    return { created: true, revisionId: id };
  }

  private requirePartner(id: string): PartnerView {
    const partner = partnerView(this.sqlite, id);
    if (!partner) throw new AppError(404, 'NOT_FOUND', 'No partner with that ID.');
    return partner;
  }

  private requireSkill(key: string): void {
    if (!this.sqlite.prepare('SELECT 1 FROM skills WHERE key = ?').get(key)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'That skill is not in the vocabulary yet. Add it first.', { skillKey: key });
    }
  }

  private requireEvidence(id: string): EvidenceView {
    const evidence = evidenceRows(this.sqlite).find((e) => e.id === id);
    if (!evidence) throw new AppError(404, 'NOT_FOUND', 'No evidence with that ID.');
    return evidence;
  }

  private validateEvidence(input: EvidenceInput): void {
    const active = new Set(activePartnerRows(this.sqlite).map((p) => p.id));
    for (const credit of input.credits) {
      if (!active.has(credit.partnerId)) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Evidence can only credit the two partners.', { partnerId: credit.partnerId });
      }
    }
    for (const key of input.skillKeys) this.requireSkill(key);
  }

  private writeEvidenceLinks(id: string, input: EvidenceInput): void {
    const skill = this.sqlite.prepare('INSERT INTO evidence_skills (evidence_id, skill_key) VALUES (?, ?)');
    for (const key of new Set(input.skillKeys)) skill.run(id, key);
    const credit = this.sqlite.prepare('INSERT INTO partner_evidence (partner_id, evidence_id, contribution_notes) VALUES (?, ?, ?)');
    for (const c of input.credits) credit.run(c.partnerId, id, c.contributionNotes);
  }
}

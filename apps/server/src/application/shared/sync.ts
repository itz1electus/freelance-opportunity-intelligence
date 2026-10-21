import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeSkillName, prettyCanonicalJson, type Qualification } from '@foi/domain';
import type { Logger } from '@foi/infra';
import type Database from 'better-sqlite3';
import type { z } from 'zod';
import { recordAudit } from '../audit.ts';
import { AppError } from '../errors.ts';
import { activePartnerRows, evidenceRows, isProvisioned, latestRevision } from '../profiles/repository.ts';
import type { MutationHooks, ProfileService } from '../profiles/service.ts';
import {
  EvidenceFileSchema,
  isManaged,
  MANAGED_DIRS,
  ManifestFileSchema,
  PartnerFileSchema,
  SHARED_FORMAT,
  SkillsFileSchema,
  StudioFileSchema,
  type EvidenceFile,
  type PartnerFile,
  type SkillsFile,
  type StudioFile,
} from './files.ts';

const MAX_FILE_BYTES = 1024 * 1024;
const FINGERPRINT_KEY = 'shared.fingerprint';
const iso = (ms: number) => new Date(ms).toISOString();
const ms = (isoString: string) => Date.parse(isoString);
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const loadedNotice = (c: { partners: number; evidence: number }) =>
  `Loaded team changes from data/shared: ${c.partners} partner profiles and ${c.evidence} evidence ${c.evidence === 1 ? 'item' : 'items'}.`;

export type SharedState = 'ok' | 'changed_externally' | 'invalid';

export interface SharedStatus {
  state: SharedState;
  problem: { file: string; message: string } | null;
  notice: string | null;
  exportError: string | null;
}

/** A shared file that cannot be loaded; names the file and the reason. */
export class SharedDataError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(message);
    this.name = 'SharedDataError';
  }
}

/**
 * Keeps data/shared/ and the local database in step (ADR-020, ADR-024).
 *
 * - After every committed change, FOI rewrites the files (only those whose
 *   content changed) and records their fingerprint.
 * - If the files no longer match that fingerprint, someone changed them
 *   outside FOI, usually `git pull`. FOI then refuses to overwrite them until
 *   they are loaded, so a teammate's work is never silently lost.
 * - At startup, changed files are loaded automatically, after a backup.
 */
export class SharedSync implements MutationHooks {
  private state: SharedState = 'ok';
  private problem: SharedStatus['problem'] = null;
  private notice: string | null = null;
  private exportError: string | null = null;
  /** Set when an export failed part-way: the database is the truth until a retry succeeds. */
  private exportPending = false;

  constructor(
    private readonly sqlite: Database.Database,
    private readonly dir: string,
    private readonly profiles: ProfileService,
    private readonly logger: Logger,
    private readonly clock: () => number,
    private readonly backupsDir: string | null = null,
  ) {}

  status(): SharedStatus {
    this.check();
    return { state: this.state, problem: this.problem, notice: this.notice, exportError: this.exportError };
  }

  /** Startup: load files that changed while FOI was not running, or write the first export. */
  startup(): void {
    const files = this.readManaged();
    if (files.size === 0) {
      if (isProvisioned(this.sqlite)) this.exportNow();
      return;
    }
    if (this.fingerprint(files) === this.lastFingerprint()) return;
    const hadData = isProvisioned(this.sqlite);
    try {
      const counts = this.load(files, { backup: hadData });
      this.notice = hadData
        ? loadedNotice(counts)
        : 'Loaded the team profiles from data/shared.';
      this.logger.info('shared.imported', { count: counts.evidence, reason: hadData ? 'changed' : 'fresh' });
    } catch (error) {
      this.markInvalid(error);
    }
  }

  /** Operator action after `git pull` or after fixing a file. */
  reload(requestId?: string): { partners: number; evidence: number } {
    const files = this.readManaged();
    if (files.size === 0) throw new AppError(422, 'SHARED_DATA_INVALID', 'There are no team data files in data/shared.');
    try {
      const counts = this.load(files, { backup: isProvisioned(this.sqlite), requestId });
      this.notice = loadedNotice(counts);
      return counts;
    } catch (error) {
      this.markInvalid(error);
      throw new AppError(422, 'SHARED_DATA_INVALID', this.problem!.message, { file: this.problem!.file });
    }
  }

  beforeMutation(): void {
    this.check();
    if (this.state === 'invalid') {
      throw new AppError(409, 'SHARED_DATA_INVALID', `Fix ${this.problem?.file} in data/shared first: ${this.problem?.message}`, {
        file: this.problem?.file,
      });
    }
    if (this.state === 'changed_externally') {
      throw new AppError(
        409,
        'SHARED_DATA_CONFLICT',
        'Team data in data/shared changed outside FOI, for example after git pull. Load those changes before editing.',
      );
    }
  }

  afterCommit(): void {
    this.exportNow();
  }

  /** Writes the export. Only files whose content changed are touched. */
  exportNow(): void {
    try {
      const desired = this.buildFiles();
      if (desired.size === 0) return;
      const existing = this.readManaged();
      for (const [rel, content] of desired) {
        if (existing.get(rel) !== content) this.writeAtomic(rel, content);
      }
      for (const rel of existing.keys()) {
        if (!desired.has(rel)) unlinkSync(join(this.dir, rel));
      }
      this.setLastFingerprint(this.fingerprint(desired));
      this.state = 'ok';
      this.problem = null;
      this.exportError = null;
      this.exportPending = false;
    } catch (error) {
      this.exportPending = true;
      this.exportError = `Could not write data/shared: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error('shared.export_failed', { error });
    }
  }

  // ------------------------------------------------------------- internals

  private check(): void {
    if (this.state === 'invalid') return;
    if (this.exportPending) {
      this.exportNow();
      if (this.exportPending) return;
    }
    const files = this.readManaged();
    const last = this.lastFingerprint();
    if (files.size === 0 && last === null) return;
    this.state = this.fingerprint(files) === last ? 'ok' : 'changed_externally';
  }

  private markInvalid(error: unknown): void {
    this.state = 'invalid';
    this.problem =
      error instanceof SharedDataError
        ? { file: error.file, message: error.message }
        : { file: 'data/shared', message: error instanceof Error ? error.message : String(error) };
    this.logger.warn('shared.import_failed', { reason: this.problem.file, error: this.problem.message });
  }

  private readManaged(): Map<string, string> {
    const out = new Map<string, string>();
    if (!existsSync(this.dir)) return out;
    const take = (rel: string) => {
      if (!isManaged(rel)) return;
      const full = join(this.dir, rel);
      const stat = lstatSync(full);
      if (!stat.isFile()) return; // symlinks and anything unusual are ignored
      if (stat.size > MAX_FILE_BYTES) throw new SharedDataError(`data/shared/${rel}`, 'File is larger than 1 MB.');
      out.set(rel, readFileSync(full, 'utf8'));
    };
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (entry.isFile()) take(entry.name);
    }
    for (const sub of MANAGED_DIRS) {
      const full = join(this.dir, sub);
      if (!existsSync(full) || !lstatSync(full).isDirectory()) continue;
      for (const entry of readdirSync(full, { withFileTypes: true })) {
        if (entry.isFile()) take(`${sub}/${entry.name}`);
      }
    }
    return out;
  }

  private fingerprint(files: Map<string, string>): string {
    const lines = [...files.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([rel, content]) => `${rel}\0${sha256(content)}\n`);
    return sha256(lines.join(''));
  }

  private lastFingerprint(): string | null {
    const row = this.sqlite.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(FINGERPRINT_KEY) as
      | { value_json: string }
      | undefined;
    return row ? (JSON.parse(row.value_json) as string) : null;
  }

  private setLastFingerprint(value: string): void {
    this.sqlite
      .prepare(
        `INSERT INTO app_settings (key, value_json, version, updated_at_ms) VALUES (?, ?, 1, ?)
         ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, version = app_settings.version + 1,
                                         updated_at_ms = excluded.updated_at_ms`,
      )
      .run(FINGERPRINT_KEY, JSON.stringify(value), this.clock());
  }

  private writeAtomic(rel: string, content: string): void {
    const full = join(this.dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    const temp = `${full}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
    writeFileSync(temp, content);
    renameSync(temp, full);
  }

  /** The export as it should be on disk, keyed by path relative to data/shared. */
  private buildFiles(): Map<string, string> {
    const files = new Map<string, string>();
    if (!isProvisioned(this.sqlite)) return files;
    files.set('foi-shared.json', prettyCanonicalJson(SHARED_FORMAT));

    for (const p of activePartnerRows(this.sqlite)) {
      const skills = this.sqlite
        .prepare(
          'SELECT canonical_skill_key, proficiency, last_used_year, notes, updated_at_ms FROM partner_skills WHERE partner_id = ? ORDER BY canonical_skill_key',
        )
        .all(p.id) as Array<{ canonical_skill_key: string; proficiency: string; last_used_year: number | null; notes: string | null; updated_at_ms: number }>;
      const services = this.sqlite
        .prepare('SELECT service_id, deliverables_json, limitations, updated_at_ms FROM partner_services WHERE partner_id = ? ORDER BY service_id')
        .all(p.id) as Array<{ service_id: string; deliverables_json: string; limitations: string | null; updated_at_ms: number }>;
      const file: PartnerFile = {
        id: p.id,
        slot: p.slot,
        displayName: p.display_name,
        weeklyHours: p.weekly_hours,
        exclusions: JSON.parse(p.exclusions_json) as string[],
        qualifications: JSON.parse(p.qualifications_json) as Qualification[],
        notes: p.notes,
        profileVersion: p.profile_version,
        createdAt: iso(p.created_at_ms),
        updatedAt: iso(p.updated_at_ms),
        skills: skills.map((s) => ({
          key: s.canonical_skill_key,
          proficiency: s.proficiency as PartnerFile['skills'][number]['proficiency'],
          lastUsedYear: s.last_used_year,
          notes: s.notes,
          updatedAt: iso(s.updated_at_ms),
        })),
        services: services.map((s) => ({
          serviceId: s.service_id,
          deliverables: JSON.parse(s.deliverables_json) as string[],
          limitations: s.limitations,
          updatedAt: iso(s.updated_at_ms),
        })),
      };
      files.set(`partners/${p.slot.toLowerCase()}.json`, prettyCanonicalJson(file));
    }

    for (const e of evidenceRows(this.sqlite)) {
      const file: EvidenceFile = {
        id: e.id,
        title: e.title,
        type: e.type,
        url: e.url,
        summary: e.summary,
        claims: e.claims,
        skillKeys: [...e.skillKeys].sort(),
        verifiedLevel: e.verifiedLevel,
        credits: [...e.credits].sort((a, b) => (a.partnerId < b.partnerId ? -1 : 1)),
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      };
      files.set(`evidence/${e.id}.json`, prettyCanonicalJson(file));
    }

    const operatorSkills = this.sqlite
      .prepare("SELECT key, label, category FROM skills WHERE origin = 'operator' ORDER BY key")
      .all() as Array<{ key: string; label: string; category: SkillsFile['skills'][number]['category'] }>;
    const aliasRows = this.sqlite
      .prepare("SELECT alias_normalized, skill_key FROM skill_aliases WHERE origin = 'operator' ORDER BY alias_normalized")
      .all() as Array<{ alias_normalized: string; skill_key: string }>;
    const skillsFile: SkillsFile = {
      skills: operatorSkills.map((s) => ({
        ...s,
        aliases: aliasRows.filter((a) => a.skill_key === s.key).map((a) => a.alias_normalized),
      })),
    };
    files.set('taxonomy/skills.json', prettyCanonicalJson(skillsFile));

    const latest = latestRevision(this.sqlite);
    if (latest) {
      const studio: StudioFile = {
        id: latest.id,
        contentHash: latest.content_hash,
        materialHash: latest.material_hash,
        createdAt: iso(latest.created_at_ms),
      };
      files.set('studio/current.json', prettyCanonicalJson(studio));
    }
    return files;
  }

  private parse<T extends z.ZodType>(files: Map<string, string>, rel: string, schema: T): z.infer<T> {
    const label = `data/shared/${rel}`;
    const text = files.get(rel);
    if (text === undefined) throw new SharedDataError(label, 'This file is missing.');
    if (/^(<{7}|={7}|>{7})( |$)/m.test(text)) {
      throw new SharedDataError(label, 'This file still has Git merge-conflict markers (<<<<<<<). Resolve the conflict, then load again.');
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new SharedDataError(label, `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new SharedDataError(label, `${issue.path.join('.') || 'file'}: ${issue.message}`);
    }
    return parsed.data;
  }

  /** Validates every file first, then replaces team-owned rows in one transaction. */
  private load(files: Map<string, string>, options: { backup: boolean; requestId?: string }): { partners: number; evidence: number } {
    const manifest = this.parse(files, 'foi-shared.json', ManifestFileSchema);
    if (manifest.formatVersion > SHARED_FORMAT.formatVersion) {
      throw new SharedDataError('data/shared/foi-shared.json', 'These files were written by a newer version of FOI. Update FOI first.');
    }
    const partners = (['a', 'b'] as const).map((slot) => {
      const file = this.parse(files, `partners/${slot}.json`, PartnerFileSchema);
      if (file.slot.toLowerCase() !== slot) {
        throw new SharedDataError(`data/shared/partners/${slot}.json`, `slot must be "${slot.toUpperCase()}" in this file.`);
      }
      return file;
    });
    if (partners[0]!.id === partners[1]!.id) {
      throw new SharedDataError('data/shared/partners/b.json', 'Partner B has the same id as Partner A.');
    }
    const evidence = [...files.keys()]
      .filter((rel) => rel.startsWith('evidence/'))
      .sort()
      .map((rel) => {
        const file = this.parse(files, rel, EvidenceFileSchema);
        if (rel !== `evidence/${file.id}.json`) throw new SharedDataError(`data/shared/${rel}`, 'The file name must match its id.');
        return { rel, file };
      });
    const taxonomy = files.has('taxonomy/skills.json')
      ? this.parse(files, 'taxonomy/skills.json', SkillsFileSchema)
      : { skills: [] };
    const studio = files.has('studio/current.json') ? this.parse(files, 'studio/current.json', StudioFileSchema) : null;

    // Cross-file checks before touching the database.
    const partnerIds = new Set(partners.map((p) => p.id));
    const seedKeys = new Set(
      (this.sqlite.prepare("SELECT key FROM skills WHERE origin = 'seed'").all() as Array<{ key: string }>).map((r) => r.key),
    );
    const knownSkills = new Set([...seedKeys, ...taxonomy.skills.map((s) => s.key)]);
    const serviceIds = new Set((this.sqlite.prepare('SELECT id FROM services').all() as Array<{ id: string }>).map((r) => r.id));
    for (const p of partners) {
      const label = `data/shared/partners/${p.slot.toLowerCase()}.json`;
      for (const s of p.skills) if (!knownSkills.has(s.key)) throw new SharedDataError(label, `Unknown skill "${s.key}".`);
      for (const s of p.services) if (!serviceIds.has(s.serviceId)) throw new SharedDataError(label, `Unknown service "${s.serviceId}".`);
      if (new Set(p.skills.map((s) => s.key)).size !== p.skills.length) throw new SharedDataError(label, 'A skill is listed twice.');
    }
    for (const { rel, file } of evidence) {
      for (const c of file.credits) {
        if (!partnerIds.has(c.partnerId)) throw new SharedDataError(`data/shared/${rel}`, 'Credits a partner who is not in partners/.');
      }
      for (const k of file.skillKeys) if (!knownSkills.has(k)) throw new SharedDataError(`data/shared/${rel}`, `Unknown skill "${k}".`);
    }

    if (options.backup && this.backupsDir) {
      mkdirSync(this.backupsDir, { recursive: true, mode: 0o700 });
      const target = join(this.backupsDir, `foi-before-shared-load-${new Date(this.clock()).toISOString().replace(/[:.]/g, '-')}.sqlite`);
      this.sqlite.prepare('VACUUM INTO ?').run(target);
    }

    this.sqlite
      .transaction(() => {
        this.applyTaxonomy(taxonomy, seedKeys);
        this.applyPartners(partners);
        this.applyEvidence(evidence.map((e) => e.file));
        this.profiles.recompute({
          preserveVersions: true,
          expectedRevision: studio ? { id: studio.id, contentHash: studio.contentHash, createdAtMs: ms(studio.createdAt) } : null,
        });
        recordAudit(
          this.sqlite,
          {
            action: 'shared.imported',
            subjectType: 'shared',
            details: { partners: partners.length, evidence: evidence.length },
            requestId: options.requestId,
          },
          this.clock(),
        );
      })
      .immediate();

    this.state = 'ok';
    this.problem = null;
    this.exportNow(); // normalizes formatting and records the fingerprint
    return { partners: partners.length, evidence: evidence.length };
  }

  private applyTaxonomy(taxonomy: SkillsFile, seedKeys: Set<string>): void {
    const upsert = this.sqlite.prepare(
      `INSERT INTO skills (key, label, category, origin, created_at_ms) VALUES (?, ?, ?, 'operator', ?)
       ON CONFLICT (key) DO UPDATE SET label = excluded.label, category = excluded.category WHERE skills.origin = 'operator'`,
    );
    const clearAliases = this.sqlite.prepare("DELETE FROM skill_aliases WHERE skill_key = ? AND origin = 'operator'");
    const alias = this.sqlite.prepare("INSERT OR IGNORE INTO skill_aliases (alias_normalized, skill_key, origin) VALUES (?, ?, 'operator')");
    for (const s of taxonomy.skills) {
      if (seedKeys.has(s.key)) continue; // the built-in vocabulary wins
      upsert.run(s.key, s.label, s.category, this.clock());
      clearAliases.run(s.key);
      for (const name of new Set([s.key, s.label, ...s.aliases].map(normalizeSkillName).filter(Boolean))) alias.run(name, s.key);
    }
  }

  private applyPartners(partners: PartnerFile[]): void {
    const ids = partners.map((p) => p.id);
    this.sqlite.prepare(`UPDATE partners SET active = 0 WHERE active = 1 AND id NOT IN (${ids.map(() => '?').join(',')})`).run(...ids);
    // Free both slots first so swapping A and B cannot hit the one-active-per-slot index.
    this.sqlite.prepare(`UPDATE partners SET active = 0 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    const upsert = this.sqlite.prepare(
      `INSERT INTO partners (id, slot, display_name, weekly_hours, exclusions_json, qualifications_json, notes, active,
                             profile_version, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET slot = excluded.slot, display_name = excluded.display_name,
         weekly_hours = excluded.weekly_hours, exclusions_json = excluded.exclusions_json,
         qualifications_json = excluded.qualifications_json, notes = excluded.notes, active = 1,
         profile_version = excluded.profile_version, created_at_ms = excluded.created_at_ms,
         updated_at_ms = excluded.updated_at_ms`,
    );
    const skill = this.sqlite.prepare(
      'INSERT INTO partner_skills (id, partner_id, canonical_skill_key, proficiency, last_used_year, notes, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const service = this.sqlite.prepare(
      'INSERT INTO partner_services (partner_id, service_id, deliverables_json, limitations, updated_at_ms) VALUES (?, ?, ?, ?, ?)',
    );
    for (const p of partners) {
      upsert.run(
        p.id,
        p.slot,
        p.displayName,
        p.weeklyHours,
        JSON.stringify(p.exclusions),
        JSON.stringify(p.qualifications),
        p.notes,
        p.profileVersion,
        ms(p.createdAt),
        ms(p.updatedAt),
      );
      this.sqlite.prepare('DELETE FROM partner_skills WHERE partner_id = ?').run(p.id);
      this.sqlite.prepare('DELETE FROM partner_services WHERE partner_id = ?').run(p.id);
      for (const s of p.skills) skill.run(randomUUID(), p.id, s.key, s.proficiency, s.lastUsedYear, s.notes, ms(s.updatedAt));
      for (const s of p.services) service.run(p.id, s.serviceId, JSON.stringify(s.deliverables), s.limitations, ms(s.updatedAt));
    }
  }

  private applyEvidence(items: EvidenceFile[]): void {
    const ids = items.map((e) => e.id);
    if (ids.length === 0) this.sqlite.prepare('DELETE FROM portfolio_evidence').run();
    else this.sqlite.prepare(`DELETE FROM portfolio_evidence WHERE id NOT IN (${ids.map(() => '?').join(',')})`).run(...ids);
    const upsert = this.sqlite.prepare(
      `INSERT INTO portfolio_evidence (id, title, evidence_type, source_url, summary, claims_json, verified_level, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET title = excluded.title, evidence_type = excluded.evidence_type,
         source_url = excluded.source_url, summary = excluded.summary, claims_json = excluded.claims_json,
         verified_level = excluded.verified_level, created_at_ms = excluded.created_at_ms, updated_at_ms = excluded.updated_at_ms`,
    );
    const skill = this.sqlite.prepare('INSERT INTO evidence_skills (evidence_id, skill_key) VALUES (?, ?)');
    const credit = this.sqlite.prepare('INSERT INTO partner_evidence (partner_id, evidence_id, contribution_notes) VALUES (?, ?, ?)');
    for (const e of items) {
      upsert.run(e.id, e.title, e.type, e.url, e.summary, JSON.stringify(e.claims), e.verifiedLevel, ms(e.createdAt), ms(e.updatedAt));
      this.sqlite.prepare('DELETE FROM evidence_skills WHERE evidence_id = ?').run(e.id);
      this.sqlite.prepare('DELETE FROM partner_evidence WHERE evidence_id = ?').run(e.id);
      for (const k of new Set(e.skillKeys)) skill.run(e.id, k);
      for (const c of e.credits) credit.run(c.partnerId, e.id, c.contributionNotes);
    }
  }
}

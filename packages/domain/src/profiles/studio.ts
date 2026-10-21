/**
 * Combined studio profile (baseline §4.2, spec §5.5, ADR-005, ADR-016).
 * Everything here is pure and deterministic: the same input always produces
 * the same snapshot, so hashing it gives a stable revision identity.
 */
import type { EvidenceType, PartnerSlot, Proficiency, Qualification, VerifiedLevel } from './contracts.ts';

export interface StudioInput {
  partners: Array<{
    id: string;
    slot: PartnerSlot;
    displayName: string;
    weeklyHours: number | null;
    exclusions: string[];
    qualifications: Qualification[];
    notes: string | null;
    profileVersion: number;
  }>;
  partnerSkills: Array<{
    partnerId: string;
    skillKey: string;
    proficiency: Proficiency;
    lastUsedYear: number | null;
    notes: string | null;
  }>;
  partnerServices: Array<{ partnerId: string; serviceId: string; deliverables: string[]; limitations: string | null }>;
  evidence: Array<{
    id: string;
    title: string;
    type: EvidenceType;
    url: string | null;
    summary: string | null;
    claims: string[];
    skillKeys: string[];
    verifiedLevel: VerifiedLevel;
    credits: Array<{ partnerId: string; contributionNotes: string | null }>;
  }>;
  skillLabels: Record<string, string>;
  serviceNames: Record<string, string>;
  studioWeeklyCapHours: number;
}

export interface StudioPartner {
  id: string;
  slot: PartnerSlot;
  displayName: string;
  weeklyHours: number | null;
  exclusions: string[];
  qualifications: Qualification[];
  notes: string | null;
  profileVersion: number;
}

export interface SkillSupport {
  partnerId: string;
  slot: PartnerSlot;
  proficiency: Proficiency;
  lastUsedYear: number | null;
  notes: string | null;
  /** Evidence credited to this partner and tagged with this skill. */
  evidenceIds: string[];
}

export interface StudioSkill {
  key: string;
  label: string;
  supportedBy: SkillSupport[];
  /** Each proof counted once, however many partners it credits (P2-03). */
  evidenceIds: string[];
}

export interface StudioService {
  id: string;
  name: string;
  offeredBy: Array<{ partnerId: string; slot: PartnerSlot; deliverables: string[]; limitations: string | null }>;
}

export interface StudioEvidence {
  id: string;
  title: string;
  type: EvidenceType;
  url: string | null;
  summary: string | null;
  claims: string[];
  skillKeys: string[];
  verifiedLevel: VerifiedLevel;
  creditedTo: Array<{ partnerId: string; slot: PartnerSlot; contributionNotes: string | null }>;
}

export interface StudioCapacity {
  capHours: number;
  perPartner: Array<{ partnerId: string; slot: PartnerSlot; weeklyHours: number | null }>;
  knownHours: number;
  /** min(cap, sum of known hours) (spec §5.5). */
  plannedWeeklyHours: number;
  /** True while any partner's hours are unknown: never assume the full cap. */
  provisional: boolean;
}

export type StudioGap =
  | { kind: 'skill_without_evidence'; partnerId: string; skillKey: string }
  | { kind: 'evidence_skill_unclaimed'; evidenceId: string; partnerId: string; skillKey: string }
  | { kind: 'evidence_without_skills'; evidenceId: string }
  | { kind: 'hours_unknown'; partnerId: string };

export interface StudioSnapshot {
  schemaVersion: 1;
  partners: StudioPartner[];
  skills: StudioSkill[];
  services: StudioService[];
  evidence: StudioEvidence[];
  capacity: StudioCapacity;
  gaps: StudioGap[];
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const uniqueSorted = (values: Iterable<string>) => [...new Set(values)].sort(byString);

export function deriveStudioSnapshot(input: StudioInput): StudioSnapshot {
  const partners = [...input.partners]
    .sort((a, b) => byString(a.slot, b.slot))
    .map<StudioPartner>((p) => ({
      id: p.id,
      slot: p.slot,
      displayName: p.displayName,
      weeklyHours: p.weeklyHours,
      exclusions: [...p.exclusions],
      qualifications: p.qualifications.map((q) => ({ ...q })),
      notes: p.notes,
      profileVersion: p.profileVersion,
    }));
  const slotOf = new Map(partners.map((p) => [p.id, p.slot]));
  const activeIds = new Set(partners.map((p) => p.id));

  const evidence = [...input.evidence]
    .sort((a, b) => byString(a.id, b.id))
    .map<StudioEvidence>((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      url: e.url,
      summary: e.summary,
      claims: [...e.claims],
      skillKeys: uniqueSorted(e.skillKeys),
      verifiedLevel: e.verifiedLevel,
      creditedTo: e.credits
        .filter((c) => activeIds.has(c.partnerId))
        .map((c) => ({ partnerId: c.partnerId, slot: slotOf.get(c.partnerId)!, contributionNotes: c.contributionNotes }))
        .sort((a, b) => byString(a.slot, b.slot)),
    }));

  // evidence credited to a partner and tagged with a skill, keyed "partnerId|skillKey"
  const proof = new Map<string, string[]>();
  for (const e of evidence) {
    for (const credit of e.creditedTo) {
      for (const key of e.skillKeys) {
        const k = `${credit.partnerId}|${key}`;
        proof.set(k, [...(proof.get(k) ?? []), e.id]);
      }
    }
  }

  const skillMap = new Map<string, SkillSupport[]>();
  for (const ps of input.partnerSkills) {
    if (!activeIds.has(ps.partnerId)) continue;
    const list = skillMap.get(ps.skillKey) ?? [];
    list.push({
      partnerId: ps.partnerId,
      slot: slotOf.get(ps.partnerId)!,
      proficiency: ps.proficiency,
      lastUsedYear: ps.lastUsedYear,
      notes: ps.notes,
      evidenceIds: uniqueSorted(proof.get(`${ps.partnerId}|${ps.skillKey}`) ?? []),
    });
    skillMap.set(ps.skillKey, list);
  }
  const skills = [...skillMap.entries()]
    .sort(([a], [b]) => byString(a, b))
    .map<StudioSkill>(([key, supportedBy]) => {
      const sorted = supportedBy.sort((a, b) => byString(a.slot, b.slot));
      return {
        key,
        label: input.skillLabels[key] ?? key,
        supportedBy: sorted,
        evidenceIds: uniqueSorted(sorted.flatMap((s) => s.evidenceIds)),
      };
    });

  const serviceMap = new Map<string, StudioService['offeredBy']>();
  for (const ps of input.partnerServices) {
    if (!activeIds.has(ps.partnerId)) continue;
    const list = serviceMap.get(ps.serviceId) ?? [];
    list.push({
      partnerId: ps.partnerId,
      slot: slotOf.get(ps.partnerId)!,
      deliverables: [...ps.deliverables],
      limitations: ps.limitations,
    });
    serviceMap.set(ps.serviceId, list);
  }
  const services = [...serviceMap.entries()]
    .sort(([a], [b]) => byString(a, b))
    .map<StudioService>(([id, offeredBy]) => ({
      id,
      name: input.serviceNames[id] ?? id,
      offeredBy: offeredBy.sort((a, b) => byString(a.slot, b.slot)),
    }));

  const perPartner = partners.map((p) => ({ partnerId: p.id, slot: p.slot, weeklyHours: p.weeklyHours }));
  const knownHours = perPartner.reduce((sum, p) => sum + (p.weeklyHours ?? 0), 0);
  const capacity: StudioCapacity = {
    capHours: input.studioWeeklyCapHours,
    perPartner,
    knownHours,
    plannedWeeklyHours: Math.min(input.studioWeeklyCapHours, knownHours),
    provisional: perPartner.some((p) => p.weeklyHours === null),
  };

  const claimed = new Set(input.partnerSkills.map((s) => `${s.partnerId}|${s.skillKey}`));
  const gaps: StudioGap[] = [];
  for (const p of partners) if (p.weeklyHours === null) gaps.push({ kind: 'hours_unknown', partnerId: p.id });
  for (const skill of skills) {
    for (const support of skill.supportedBy) {
      if (support.evidenceIds.length === 0) {
        gaps.push({ kind: 'skill_without_evidence', partnerId: support.partnerId, skillKey: skill.key });
      }
    }
  }
  for (const e of evidence) {
    if (e.skillKeys.length === 0) gaps.push({ kind: 'evidence_without_skills', evidenceId: e.id });
    for (const credit of e.creditedTo) {
      for (const key of e.skillKeys) {
        if (!claimed.has(`${credit.partnerId}|${key}`)) {
          gaps.push({ kind: 'evidence_skill_unclaimed', evidenceId: e.id, partnerId: credit.partnerId, skillKey: key });
        }
      }
    }
  }

  return { schemaVersion: 1, partners, skills, services, evidence, capacity, gaps };
}

/**
 * The part of the snapshot that can change a score (COST-03). Names, notes,
 * titles, summaries, links and contribution notes are left out, so fixing a
 * typo never makes an evaluation stale (P2-08). Orderings that carry no
 * meaning are sorted.
 */
export function materialProjection(snapshot: StudioSnapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    capHours: snapshot.capacity.capHours,
    partners: snapshot.partners.map((p) => ({
      id: p.id,
      slot: p.slot,
      weeklyHours: p.weeklyHours,
      exclusions: [...p.exclusions].sort(byString),
      qualifications: p.qualifications
        .map((q) => ({ name: q.name, issuer: q.issuer, year: q.year }))
        .sort((a, b) => byString(a.name, b.name)),
    })),
    skills: snapshot.skills.map((s) => skillMaterial(s)),
    services: snapshot.services.map((s) => serviceMaterial(s)),
    evidence: snapshot.evidence.map((e) => evidenceMaterial(e)),
  };
}

const skillMaterial = (s: StudioSkill) => ({
  key: s.key,
  supportedBy: s.supportedBy.map((x) => ({ partnerId: x.partnerId, proficiency: x.proficiency, lastUsedYear: x.lastUsedYear })),
});

const serviceMaterial = (s: StudioService) => ({
  id: s.id,
  offeredBy: s.offeredBy.map((x) => ({
    partnerId: x.partnerId,
    deliverables: [...x.deliverables].sort(byString),
    limitations: x.limitations,
  })),
});

const evidenceMaterial = (e: StudioEvidence) => ({
  id: e.id,
  type: e.type,
  claims: [...e.claims].sort(byString),
  skillKeys: e.skillKeys,
  verifiedLevel: e.verifiedLevel,
  creditedTo: e.creditedTo.map((c) => c.partnerId).sort(byString),
});

/** Per-partner view used to decide whether that partner's profile version changes. */
export function partnerProjection(snapshot: StudioSnapshot, partnerId: string) {
  const partner = snapshot.partners.find((p) => p.id === partnerId);
  if (!partner) return null;
  const { profileVersion: _ignored, ...rest } = partner;
  return {
    ...rest,
    skills: snapshot.skills.flatMap((s) =>
      s.supportedBy
        .filter((x) => x.partnerId === partnerId)
        .map((x) => ({ key: s.key, proficiency: x.proficiency, lastUsedYear: x.lastUsedYear, notes: x.notes })),
    ),
    services: snapshot.services.flatMap((s) =>
      s.offeredBy.filter((x) => x.partnerId === partnerId).map((x) => ({ id: s.id, deliverables: x.deliverables, limitations: x.limitations })),
    ),
    evidence: snapshot.evidence
      .filter((e) => e.creditedTo.some((c) => c.partnerId === partnerId))
      .map((e) => ({ ...e, creditedTo: e.creditedTo.map((c) => ({ partnerId: c.partnerId, contributionNotes: c.contributionNotes })) })),
  };
}

export interface StudioDiff {
  materialChanged: boolean;
  /** Hours, exclusions, qualifications or the partner set changed: affects every listing. */
  partnerLevelChanged: boolean;
  changedSkillKeys: string[];
  changedServiceIds: string[];
  changedEvidenceIds: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function changedKeys<T>(before: T[], after: T[], keyOf: (t: T) => string): string[] {
  const a = new Map(before.map((x) => [keyOf(x), JSON.stringify(x)]));
  const b = new Map(after.map((x) => [keyOf(x), JSON.stringify(x)]));
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys].filter((k) => a.get(k) !== b.get(k)).sort(byString);
}

/** What changed between two snapshots, in scoring terms (ADR-016). */
export function diffStudio(before: StudioSnapshot, after: StudioSnapshot): StudioDiff {
  const a = materialProjection(before);
  const b = materialProjection(after);
  const changedEvidenceIds = changedKeys(a.evidence, b.evidence, (e) => e.id);
  const evidenceSkills = new Set<string>();
  for (const id of changedEvidenceIds) {
    for (const e of [...before.evidence, ...after.evidence]) if (e.id === id) e.skillKeys.forEach((k) => evidenceSkills.add(k));
  }
  const changedSkillKeys = uniqueSorted([...changedKeys(a.skills, b.skills, (s) => s.key), ...evidenceSkills]);
  return {
    materialChanged: !same(a, b),
    partnerLevelChanged: !same(a.partners, b.partners) || a.capHours !== b.capHours,
    changedSkillKeys,
    changedServiceIds: changedKeys(a.services, b.services, (s) => s.id),
    changedEvidenceIds,
  };
}

export type StaleReason = 'capacity_or_partner_changed' | 'relevant_skill_changed' | 'relevant_service_changed' | 'unknown_relevance';

/**
 * Decides whether an evaluation made against an older studio profile is stale
 * (P2-05, P2-08). Unknown relevance is treated as stale: never reuse a score
 * that might be wrong.
 */
export function studioStaleness(input: {
  sameMaterial: boolean;
  diff: StudioDiff | null;
  relevantSkillKeys: readonly string[] | null;
  relevantServiceIds: readonly string[] | null;
}): { stale: boolean; reasons: StaleReason[] } {
  if (input.sameMaterial) return { stale: false, reasons: [] };
  const { diff } = input;
  if (!diff || input.relevantSkillKeys === null || input.relevantServiceIds === null) {
    return { stale: true, reasons: ['unknown_relevance'] };
  }
  const reasons: StaleReason[] = [];
  if (diff.partnerLevelChanged) reasons.push('capacity_or_partner_changed');
  if (diff.changedSkillKeys.some((k) => input.relevantSkillKeys!.includes(k))) reasons.push('relevant_skill_changed');
  if (diff.changedServiceIds.some((k) => input.relevantServiceIds!.includes(k))) reasons.push('relevant_service_changed');
  return { stale: reasons.length > 0, reasons };
}

export interface SkillCapacity {
  skillKey: string;
  partners: Array<{ partnerId: string; slot: PartnerSlot; weeklyHours: number | null }>;
  /** Hours per week the partners who hold this skill can give; null if none known. */
  availableHours: number | null;
  provisional: boolean;
  missing: boolean;
}

/**
 * Capacity per required skill (P2-06, spec §5.5): a skill only one partner
 * holds is limited to that partner's hours, never the pooled studio total.
 */
export function capacityForSkills(snapshot: StudioSnapshot, requiredSkillKeys: readonly string[]) {
  const hours = new Map(snapshot.partners.map((p) => [p.id, p.weeklyHours]));
  const perSkill: SkillCapacity[] = uniqueSorted(requiredSkillKeys).map((skillKey) => {
    const skill = snapshot.skills.find((s) => s.key === skillKey);
    const partners = (skill?.supportedBy ?? []).map((s) => ({ partnerId: s.partnerId, slot: s.slot, weeklyHours: hours.get(s.partnerId) ?? null }));
    const known = partners.filter((p) => p.weeklyHours !== null);
    const availableHours =
      known.length === 0 ? null : Math.min(snapshot.capacity.capHours, known.reduce((sum, p) => sum + p.weeklyHours!, 0));
    return {
      skillKey,
      partners,
      availableHours,
      provisional: partners.some((p) => p.weeklyHours === null),
      missing: partners.length === 0,
    };
  });
  const limitations = perSkill
    .filter((s) => !s.missing && s.partners.length === 1 && s.availableHours !== null && s.availableHours < snapshot.capacity.plannedWeeklyHours)
    .map((s) => ({
      skillKey: s.skillKey,
      partnerId: s.partners[0]!.partnerId,
      slot: s.partners[0]!.slot,
      availableHours: s.availableHours!,
    }));
  return { perSkill, limitations, studioPlannedHours: snapshot.capacity.plannedWeeklyHours };
}

export interface CompletenessItem {
  key: 'hours' | 'skills' | 'services' | 'evidence';
  done: boolean;
  label: string;
}

/** A plain checklist rather than a made-up percentage (UX-12). */
export function partnerCompleteness(snapshot: StudioSnapshot, partnerId: string) {
  const partner = snapshot.partners.find((p) => p.id === partnerId);
  const skills = snapshot.skills.flatMap((s) => s.supportedBy.filter((x) => x.partnerId === partnerId));
  const withEvidence = skills.filter((s) => s.evidenceIds.length > 0).length;
  const services = snapshot.services.filter((s) => s.offeredBy.some((o) => o.partnerId === partnerId)).length;
  const items: CompletenessItem[] = [
    { key: 'hours', done: partner?.weeklyHours !== null && partner !== undefined, label: 'Weekly hours set' },
    { key: 'skills', done: skills.length >= 3, label: 'At least three skills' },
    { key: 'services', done: services >= 1, label: 'At least one service' },
    {
      key: 'evidence',
      done: skills.length > 0 && withEvidence === skills.length,
      label: 'Evidence for every skill',
    },
  ];
  return { items, skillCount: skills.length, skillsWithEvidence: withEvidence, serviceCount: services };
}

export interface RevisionView {
  id: string;
  /** Local to this machine; ids and hashes are the same everywhere. */
  revision: number;
  createdAt: string;
  contentHash: string;
  materialHash: string;
  changeSummary: Partial<StudioDiff> & { initial?: boolean };
}

export interface StudioView {
  revision: RevisionView;
  /** When the scoring-relevant content last changed; scores made since then are still current. */
  materialSince: string;
  snapshot: StudioSnapshot;
  completeness: Record<string, ReturnType<typeof partnerCompleteness>>;
}

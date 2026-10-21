import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  capacityForSkills,
  deriveStudioSnapshot,
  diffStudio,
  materialProjection,
  normalizeSkillName,
  partnerCompleteness,
  prettyCanonicalJson,
  SEED_SERVICES,
  SEED_SKILLS,
  skillKeyFromLabel,
  studioStaleness,
  type StudioInput,
} from '../src/index.ts';

// Fictional test partners; never the studio's real credentials (spec §6.3).
const A = 'partner-a-id';
const B = 'partner-b-id';

function baseInput(): StudioInput {
  return {
    partners: [
      { id: B, slot: 'B', displayName: 'Test Partner B', weeklyHours: 5, exclusions: [], qualifications: [], notes: null, profileVersion: 1 },
      { id: A, slot: 'A', displayName: 'Test Partner A', weeklyHours: 30, exclusions: [], qualifications: [], notes: null, profileVersion: 1 },
    ],
    partnerSkills: [],
    partnerServices: [],
    evidence: [],
    skillLabels: Object.fromEntries(SEED_SKILLS.map((s) => [s.key, s.label])),
    serviceNames: Object.fromEntries(SEED_SERVICES.map((s) => [s.id, s.name])),
    studioWeeklyCapHours: 45,
  };
}

const skill = (partnerId: string, skillKey: string, proficiency: 'working' | 'expert' = 'working') => ({
  partnerId,
  skillKey,
  proficiency,
  lastUsedYear: 2026,
  notes: null,
});

const evidence = (id: string, skillKeys: string[], partnerIds: string[]) => ({
  id,
  title: `Project ${id}`,
  type: 'client_project' as const,
  url: null,
  summary: null,
  claims: ['Built a reporting pipeline'],
  skillKeys,
  verifiedLevel: 'self_reported' as const,
  credits: partnerIds.map((partnerId) => ({ partnerId, contributionNotes: null })),
});

describe('taxonomy', () => {
  it('has unique keys and no alias that points at two skills', () => {
    const keys = SEED_SKILLS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const owner = new Map<string, string>();
    for (const s of SEED_SKILLS) {
      for (const name of [s.key, s.label, ...s.aliases]) {
        const n = normalizeSkillName(name);
        expect(owner.get(n) ?? s.key, `${name} is claimed by ${owner.get(n)} and ${s.key}`).toBe(s.key);
        owner.set(n, s.key);
      }
    }
  });

  it('matches the usual spellings of one skill', () => {
    const forms = ['Power BI', 'PowerBI', 'power-bi', 'POWER BI'];
    expect(new Set(forms.map(normalizeSkillName)).size).toBe(1);
    expect(normalizeSkillName('C++')).not.toBe(normalizeSkillName('C'));
    expect(normalizeSkillName('C#')).toBe('csharp');
    expect(skillKeyFromLabel('Apache Airflow 2.x')).toBe('apache-airflow-2-x');
  });

  it('seeds the six initial services', () => {
    expect(SEED_SERVICES).toHaveLength(6);
  });
});

describe('canonical JSON', () => {
  it('ignores key order and rejects non-finite numbers', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(prettyCanonicalJson({ b: 1, a: 2 })).toBe('{\n  "a": 2,\n  "b": 1\n}\n');
  });
});

describe('studio snapshot', () => {
  it('orders partners by slot regardless of input order', () => {
    const snap = deriveStudioSnapshot(baseInput());
    expect(snap.partners.map((p) => p.slot)).toEqual(['A', 'B']);
  });

  it('P2-02: a skill added only to Partner A is attributed only to A', () => {
    const input = baseInput();
    input.partnerSkills.push(skill(A, 'power-bi'));
    const snap = deriveStudioSnapshot(input);
    expect(snap.skills).toHaveLength(1);
    expect(snap.skills[0]!.supportedBy.map((s) => s.slot)).toEqual(['A']);
  });

  it('P2-03: a shared skill and a joint project are each counted once', () => {
    const input = baseInput();
    input.partnerSkills.push(skill(A, 'sql', 'expert'), skill(B, 'sql'));
    input.evidence.push(evidence('ev-joint', ['sql'], [A, B]));
    const snap = deriveStudioSnapshot(input);
    expect(snap.skills).toHaveLength(1);
    expect(snap.skills[0]!.supportedBy.map((s) => s.slot)).toEqual(['A', 'B']);
    expect(snap.skills[0]!.evidenceIds).toEqual(['ev-joint']);
    expect(snap.evidence).toHaveLength(1);
    expect(snap.evidence[0]!.creditedTo.map((c) => c.slot)).toEqual(['A', 'B']);
  });

  it('P2-07: a claim without evidence is reported as a gap, never filled in', () => {
    const input = baseInput();
    input.partnerSkills.push(skill(B, 'dbt'));
    const snap = deriveStudioSnapshot(input);
    expect(snap.gaps).toContainEqual({ kind: 'skill_without_evidence', partnerId: B, skillKey: 'dbt' });
    expect(snap.evidence).toEqual([]);
    expect(snap.skills[0]!.evidenceIds).toEqual([]);
  });

  it('flags evidence tagged with a skill the credited partner has not listed', () => {
    const input = baseInput();
    input.partnerSkills.push(skill(A, 'airflow'));
    input.evidence.push(evidence('ev1', ['airflow'], [A, B]));
    const snap = deriveStudioSnapshot(input);
    expect(snap.gaps).toContainEqual({ kind: 'evidence_skill_unclaimed', evidenceId: 'ev1', partnerId: B, skillKey: 'airflow' });
    expect(snap.skills[0]!.supportedBy.map((s) => s.slot)).toEqual(['A']);
  });

  it('plans with min(cap, known hours) and is provisional while hours are unknown', () => {
    const input = baseInput();
    input.partners[0]!.weeklyHours = 40;
    expect(deriveStudioSnapshot(input).capacity).toMatchObject({ knownHours: 70, plannedWeeklyHours: 45, provisional: false });
    input.partners[0]!.weeklyHours = null;
    const snap = deriveStudioSnapshot(input);
    expect(snap.capacity).toMatchObject({ knownHours: 30, plannedWeeklyHours: 30, provisional: true });
    expect(snap.gaps).toContainEqual({ kind: 'hours_unknown', partnerId: B });
  });

  it('P2-06: a skill only Partner B holds is limited to B’s hours, not the pooled total', () => {
    const input = baseInput();
    input.partnerSkills.push(skill(B, 'dbt', 'expert'), skill(A, 'sql'), skill(B, 'sql'));
    const snap = deriveStudioSnapshot(input);
    const cap = capacityForSkills(snap, ['dbt', 'sql', 'kafka']);
    expect(cap.studioPlannedHours).toBe(35);
    const dbt = cap.perSkill.find((s) => s.skillKey === 'dbt')!;
    expect(dbt.availableHours).toBe(5);
    expect(cap.perSkill.find((s) => s.skillKey === 'sql')!.availableHours).toBe(35);
    expect(cap.perSkill.find((s) => s.skillKey === 'kafka')).toMatchObject({ missing: true, availableHours: null });
    expect(cap.limitations).toEqual([{ skillKey: 'dbt', partnerId: B, slot: 'B', availableHours: 5 }]);
  });

  it('is deterministic for the same input in any order', () => {
    const one = baseInput();
    one.partnerSkills.push(skill(A, 'sql'), skill(A, 'python'), skill(B, 'sql'));
    one.evidence.push(evidence('e2', ['sql'], [B]), evidence('e1', ['python', 'sql'], [A]));
    const two = baseInput();
    two.partnerSkills.push(skill(B, 'sql'), skill(A, 'python'), skill(A, 'sql'));
    two.evidence.push(evidence('e1', ['sql', 'python'], [A]), evidence('e2', ['sql'], [B]));
    expect(canonicalJson(deriveStudioSnapshot(one))).toBe(canonicalJson(deriveStudioSnapshot(two)));
  });
});

describe('material changes and staleness (ADR-016)', () => {
  const withSkills = () => {
    const input = baseInput();
    input.partnerSkills.push(skill(A, 'power-bi'), skill(B, 'dbt'));
    input.partnerServices.push({ partnerId: A, serviceId: 'data-analysis-bi', deliverables: ['Dashboards'], limitations: null });
    input.evidence.push(evidence('ev1', ['power-bi'], [A]));
    return input;
  };

  it('P2-08: names, notes and titles do not change the material projection', () => {
    const before = deriveStudioSnapshot(withSkills());
    const edited = withSkills();
    edited.partners[0]!.notes = 'Prefers async communication';
    edited.partners[1]!.displayName = 'Renamed';
    edited.partnerSkills[0]!.notes = 'Mostly DAX';
    edited.evidence[0]!.title = 'Fixed a typo';
    edited.evidence[0]!.summary = 'Longer description';
    const after = deriveStudioSnapshot(edited);
    expect(canonicalJson(after)).not.toBe(canonicalJson(before));
    expect(canonicalJson(materialProjection(after))).toBe(canonicalJson(materialProjection(before)));
    expect(diffStudio(before, after).materialChanged).toBe(false);
  });

  it('P2-04 (domain): skill, evidence and hours changes are material', () => {
    const before = deriveStudioSnapshot(withSkills());
    const skillChange = withSkills();
    skillChange.partnerSkills[0]!.proficiency = 'expert';
    expect(diffStudio(before, deriveStudioSnapshot(skillChange))).toMatchObject({
      materialChanged: true,
      partnerLevelChanged: false,
      changedSkillKeys: ['power-bi'],
    });
    const evidenceChange = withSkills();
    evidenceChange.evidence[0]!.claims = ['Different claim'];
    expect(diffStudio(before, deriveStudioSnapshot(evidenceChange))).toMatchObject({
      changedEvidenceIds: ['ev1'],
      changedSkillKeys: ['power-bi'],
    });
    const hours = withSkills();
    hours.partners[0]!.weeklyHours = 10;
    expect(diffStudio(before, deriveStudioSnapshot(hours))).toMatchObject({ materialChanged: true, partnerLevelChanged: true });
  });

  it('P2-05 (domain): an evaluation is stale only when something relevant changed', () => {
    const before = deriveStudioSnapshot(withSkills());
    const changed = withSkills();
    changed.partnerSkills[1]!.proficiency = 'expert'; // dbt, held by B
    const diff = diffStudio(before, deriveStudioSnapshot(changed));
    const evaluate = (skills: string[] | null, services: string[] | null) =>
      studioStaleness({ sameMaterial: false, diff, relevantSkillKeys: skills, relevantServiceIds: services });

    expect(evaluate(['dbt', 'sql'], [])).toEqual({ stale: true, reasons: ['relevant_skill_changed'] });
    expect(evaluate(['power-bi'], ['data-analysis-bi'])).toEqual({ stale: false, reasons: [] });
    expect(evaluate(null, [])).toEqual({ stale: true, reasons: ['unknown_relevance'] });
    expect(studioStaleness({ sameMaterial: true, diff: null, relevantSkillKeys: null, relevantServiceIds: null }).stale).toBe(false);

    const hours = withSkills();
    hours.partners[1]!.weeklyHours = 25;
    const hoursDiff = diffStudio(before, deriveStudioSnapshot(hours));
    expect(studioStaleness({ sameMaterial: false, diff: hoursDiff, relevantSkillKeys: ['power-bi'], relevantServiceIds: [] })).toEqual({
      stale: true,
      reasons: ['capacity_or_partner_changed'],
    });
  });

  it('reports partner completeness as a checklist', () => {
    const snap = deriveStudioSnapshot(withSkills());
    const a = partnerCompleteness(snap, A);
    expect(a.items.find((i) => i.key === 'hours')?.done).toBe(true);
    expect(a.items.find((i) => i.key === 'skills')?.done).toBe(false);
    expect(a.items.find((i) => i.key === 'evidence')?.done).toBe(true);
    expect(partnerCompleteness(snap, B).items.find((i) => i.key === 'evidence')?.done).toBe(false);
  });
});

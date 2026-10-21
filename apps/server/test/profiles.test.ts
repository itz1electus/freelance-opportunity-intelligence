import type { EvidenceView, PartnerView } from '@foi/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTestServer } from './helpers.ts';

let server: ReturnType<typeof makeTestServer>;
afterEach(() => server?.close());

type Json = Record<string, unknown>;
const json = async <T = Json>(res: Response) => (await res.json()) as T;

/** Fictional test partners only (spec §6.3). */
async function provisioned() {
  server = makeTestServer();
  const cookie = await server.login();
  const res = await server.req('/api/v1/setup/partners', {
    method: 'POST',
    cookie,
    body: { partnerA: { displayName: 'Test Partner A' }, partnerB: { displayName: 'Test Partner B' } },
  });
  expect(res.status).toBe(201);
  const { items } = await json<{ items: PartnerView[] }>(res);
  const [a, b] = items as [PartnerView, PartnerView];
  const call = (path: string, method = 'GET', body?: unknown) => server.req(`/api/v1${path}`, { method, body, cookie });
  const studio = async () => json<{ revision: { id: string; revision: number; materialHash: string }; snapshot: Json }>(await call('/studio-profile'));
  return { cookie, a, b, call, studio };
}

const skillBody = { proficiency: 'advanced', lastUsedYear: 2026, notes: null };

describe('Phase 2: partner profiles and studio profile', () => {
  it('P2-01: setup creates exactly two separately editable partner slots', async () => {
    const { a, b, call } = await provisioned();
    expect([a.slot, b.slot]).toEqual(['A', 'B']);
    expect((await json<{ items: PartnerView[] }>(await call('/partners'))).items).toHaveLength(2);
    const again = await call('/setup/partners', 'POST', { partnerA: { displayName: 'X' }, partnerB: { displayName: 'Y' } });
    expect(again.status).toBe(409);
    expect((await json<{ items: PartnerView[] }>(await call('/partners'))).items).toHaveLength(2);

    await call(`/partners/${a.id}`, 'PATCH', { weeklyHours: 30 });
    expect((await json<PartnerView>(await call(`/partners/${a.id}`))).weeklyHours).toBe(30);
    expect((await json<PartnerView>(await call(`/partners/${b.id}`))).weeklyHours).toBeNull();
    expect((await json<{ partnersProvisioned: boolean }>(await call('/setup/status'))).partnersProvisioned).toBe(true);
  });

  it('P2-02: a skill added only to Partner A is attributed only to A', async () => {
    const { a, call, studio } = await provisioned();
    expect((await call(`/partners/${a.id}/skills/power-bi`, 'PUT', skillBody)).status).toBe(200);
    const { snapshot } = await studio();
    const skills = snapshot.skills as Array<{ key: string; supportedBy: Array<{ slot: string }> }>;
    expect(skills.map((s) => s.key)).toEqual(['power-bi']);
    expect(skills[0]!.supportedBy.map((s) => s.slot)).toEqual(['A']);
  });

  it('P2-03: one canonical skill with both partners, and joint evidence counted once', async () => {
    const { a, b, call, studio } = await provisioned();
    await call(`/partners/${a.id}/skills/sql`, 'PUT', skillBody);
    await call(`/partners/${b.id}/skills/sql`, 'PUT', { ...skillBody, proficiency: 'working' });
    const created = await call('/evidence', 'POST', {
      title: 'Sales reporting rebuild',
      type: 'client_project',
      url: null,
      summary: null,
      claims: ['Replaced 12 spreadsheets with one model'],
      skillKeys: ['sql'],
      verifiedLevel: 'self_reported',
      credits: [
        { partnerId: a.id, contributionNotes: 'Data model' },
        { partnerId: b.id, contributionNotes: 'Report pages' },
      ],
    });
    expect(created.status).toBe(201);
    const { snapshot } = await studio();
    const skills = snapshot.skills as Array<{ key: string; supportedBy: Array<{ slot: string }>; evidenceIds: string[] }>;
    expect(skills).toHaveLength(1);
    expect(skills[0]!.supportedBy.map((s) => s.slot)).toEqual(['A', 'B']);
    expect(skills[0]!.evidenceIds).toHaveLength(1);
    expect(snapshot.evidence as unknown[]).toHaveLength(1);
  });

  it('P2-04: skill, evidence and hours edits bump the partner version and add an immutable revision', async () => {
    const { a, b, call, studio } = await provisioned();
    const r1 = await studio();
    await call(`/partners/${a.id}/skills/python`, 'PUT', skillBody);
    const afterSkill = await json<PartnerView>(await call(`/partners/${a.id}`));
    expect(afterSkill.profileVersion).toBe(2);
    expect((await json<PartnerView>(await call(`/partners/${b.id}`))).profileVersion).toBe(1);
    const r2 = await studio();
    expect(r2.revision.revision).toBe(r1.revision.revision + 1);
    expect(r2.revision.id).not.toBe(r1.revision.id);
    expect(r2.revision.materialHash).not.toBe(r1.revision.materialHash);

    await call(`/partners/${a.id}`, 'PATCH', { weeklyHours: 20 });
    expect((await json<PartnerView>(await call(`/partners/${a.id}`))).profileVersion).toBe(3);

    const ev = await json<EvidenceView>(
      await call('/evidence', 'POST', {
        title: 'Forecasting prototype',
        type: 'personal_project',
        url: 'https://example.com/forecast',
        summary: null,
        claims: ['Weekly demand forecast'],
        skillKeys: ['python'],
        verifiedLevel: 'public_link',
        credits: [{ partnerId: a.id, contributionNotes: null }],
      }),
    );
    expect((await json<PartnerView>(await call(`/partners/${a.id}`))).profileVersion).toBe(4);
    expect((await json<PartnerView>(await call(`/partners/${a.id}`))).skills[0]!.evidenceCount).toBe(1);

    // The old revision is still there, unchanged.
    const revisions = await json<{ items: Array<{ id: string; revision: number }> }>(await call('/studio-profile/revisions'));
    expect(revisions.items.map((r) => r.id)).toContain(r1.revision.id);
    expect(revisions.items[0]!.revision).toBe(r1.revision.revision + 3);

    // Saving the same values again changes nothing.
    await call(`/partners/${a.id}/skills/python`, 'PUT', skillBody);
    await call(`/evidence/${ev.id}`, 'PUT', {
      title: ev.title,
      type: ev.type,
      url: ev.url,
      summary: ev.summary,
      claims: ev.claims,
      skillKeys: ev.skillKeys,
      verifiedLevel: ev.verifiedLevel,
      credits: ev.credits,
    });
    expect((await json<PartnerView>(await call(`/partners/${a.id}`))).profileVersion).toBe(4);
    expect((await studio()).revision.revision).toBe(r1.revision.revision + 3);
  });

  it('P2-08: editing only notes adds a revision but keeps the material hash', async () => {
    const { a, call, studio } = await provisioned();
    await call(`/partners/${a.id}/skills/sql`, 'PUT', skillBody);
    const before = await studio();
    await call(`/partners/${a.id}`, 'PATCH', { notes: 'Prefers async updates', displayName: 'Renamed A' });
    await call(`/partners/${a.id}/skills/sql`, 'PUT', { ...skillBody, notes: 'Mostly reporting queries' });
    const after = await studio();
    expect(after.revision.id).not.toBe(before.revision.id);
    expect(after.revision.materialHash).toBe(before.revision.materialHash);
    const summary = (await json<{ items: Array<{ changeSummary: { materialChanged?: boolean } }> }>(await call('/studio-profile/revisions')))
      .items[0]!.changeSummary;
    expect(summary.materialChanged).toBe(false);
  });

  it('P2-07: shows a claim without evidence as a gap', async () => {
    const { b, call, studio } = await provisioned();
    await call(`/partners/${b.id}/skills/dbt`, 'PUT', skillBody);
    const { snapshot } = await studio();
    expect(snapshot.gaps).toContainEqual({ kind: 'skill_without_evidence', partnerId: b.id, skillKey: 'dbt' });
    expect(snapshot.evidence).toEqual([]);
    const view = await json<PartnerView>(await call(`/partners/${b.id}`));
    expect(view.skills[0]!.evidenceCount).toBe(0);
  });

  it('P2-06: per-skill capacity follows the partner who holds the skill', async () => {
    const { a, b, call, studio } = await provisioned();
    await call(`/partners/${a.id}`, 'PATCH', { weeklyHours: 35 });
    await call(`/partners/${b.id}`, 'PATCH', { weeklyHours: 5 });
    await call(`/partners/${b.id}/skills/dbt`, 'PUT', skillBody);
    const { snapshot } = await studio();
    expect(snapshot.capacity).toMatchObject({ knownHours: 40, plannedWeeklyHours: 40, provisional: false });
    // The per-skill rule itself is covered in packages/domain/test/studio.test.ts.
  });

  it('resolves skill names through the vocabulary and adds new skills once', async () => {
    const { a, call } = await provisioned();
    const vocab = await json<{ items: Array<{ key: string; aliases: string[] }> }>(await call('/skills'));
    expect(vocab.items.find((s) => s.key === 'power-bi')?.aliases).toContain('microsoftpowerbi');

    const added = await call('/skills', 'POST', { label: 'Microsoft Fabric', category: 'data_bi', aliases: ['MS Fabric'] });
    expect(added.status).toBe(201);
    expect((await json<{ key: string }>(added)).key).toBe('microsoft-fabric');
    const duplicate = await call('/skills', 'POST', { label: 'MS-Fabric', category: 'data_bi', aliases: [] });
    expect(duplicate.status).toBe(409);
    expect(((await json<{ error: { details: { skillKey: string } } }>(duplicate)).error.details.skillKey)).toBe('microsoft-fabric');
    expect((await call('/skills', 'POST', { label: 'PowerBI', category: 'data_bi', aliases: [] })).status).toBe(409);

    expect((await call(`/partners/${a.id}/skills/microsoft-fabric`, 'PUT', skillBody)).status).toBe(200);
    const unknown = await call(`/partners/${a.id}/skills/not-a-skill`, 'PUT', skillBody);
    expect(unknown.status).toBe(422);
  });

  it('validates profile input on the server', async () => {
    const { a, b, call } = await provisioned();
    expect((await call(`/partners/${a.id}`, 'PATCH', { weeklyHours: 100 })).status).toBe(422);
    expect((await call(`/partners/${a.id}`, 'PATCH', { unexpected: 1 })).status).toBe(422);
    expect((await call(`/partners/${a.id}/skills/sql`, 'PUT', { ...skillBody, lastUsedYear: 2999 })).status).toBe(422);
    expect((await call(`/partners/${a.id}/skills/sql`, 'PUT', { ...skillBody, proficiency: 'guru' })).status).toBe(422);
    expect((await call('/partners/nope', 'PATCH', { weeklyHours: 3 })).status).toBe(404);

    const evidence = {
      title: 'X',
      type: 'client_project',
      url: 'javascript:alert(1)',
      summary: null,
      claims: [],
      skillKeys: [],
      verifiedLevel: 'self_reported',
      credits: [{ partnerId: a.id, contributionNotes: null }],
    };
    expect((await call('/evidence', 'POST', evidence)).status).toBe(422);
    expect((await call('/evidence', 'POST', { ...evidence, url: null, credits: [] })).status).toBe(422);
    expect(
      (await call('/evidence', 'POST', { ...evidence, url: null, credits: [{ partnerId: 'someone-else', contributionNotes: null }] })).status,
    ).toBe(422);
    expect((await call('/evidence', 'POST', { ...evidence, url: null, verifiedLevel: 'public_link' })).status).toBe(422);
    expect(
      (await call('/evidence', 'POST', { ...evidence, url: null, credits: [{ partnerId: b.id, contributionNotes: null }, { partnerId: b.id, contributionNotes: null }] }))
        .status,
    ).toBe(422);
  });

  it('refuses a stale profile version instead of overwriting another tab’s edit', async () => {
    const { a, call } = await provisioned();
    await call(`/partners/${a.id}`, 'PATCH', { weeklyHours: 10, expectedProfileVersion: 1 });
    const stale = await call(`/partners/${a.id}`, 'PATCH', { weeklyHours: 12, expectedProfileVersion: 1 });
    expect(stale.status).toBe(409);
    expect((await json<{ error: { code: string } }>(stale)).error.code).toBe('VERSION_CONFLICT');
    expect((await json<PartnerView>(await call(`/partners/${a.id}`))).weeklyHours).toBe(10);
  });

  it('manages services and removes skills and evidence', async () => {
    const { a, call, studio } = await provisioned();
    const services = await json<{ items: Array<{ id: string }> }>(await call('/services'));
    expect(services.items).toHaveLength(6);
    await call(`/partners/${a.id}/services/data-analysis-bi`, 'PUT', { deliverables: ['Power BI dashboards'], limitations: null });
    expect((await json<PartnerView>(await call(`/partners/${a.id}`))).services.map((s) => s.serviceId)).toEqual(['data-analysis-bi']);
    expect((await call(`/partners/${a.id}/services/not-a-service`, 'PUT', { deliverables: [], limitations: null })).status).toBe(404);
    expect((await call(`/partners/${a.id}/services/data-analysis-bi`, 'DELETE')).status).toBe(200);

    await call(`/partners/${a.id}/skills/sql`, 'PUT', skillBody);
    expect((await call(`/partners/${a.id}/skills/sql`, 'DELETE')).status).toBe(200);
    expect((await call(`/partners/${a.id}/skills/sql`, 'DELETE')).status).toBe(404);

    const ev = await json<EvidenceView>(
      await call('/evidence', 'POST', {
        title: 'Temp',
        type: 'personal_project',
        url: null,
        summary: null,
        claims: [],
        skillKeys: [],
        verifiedLevel: 'self_reported',
        credits: [{ partnerId: a.id, contributionNotes: null }],
      }),
    );
    expect((await call(`/evidence/${ev.id}`, 'DELETE')).status).toBe(204);
    expect((await studio()).snapshot.evidence).toEqual([]);
  });

  it('audits profile changes without storing free text', async () => {
    const { a, call } = await provisioned();
    await call(`/partners/${a.id}`, 'PATCH', { notes: 'private note text' });
    const audit = await json<{ items: Array<{ action: string; details: Json; subjectId: string | null }> }>(await call('/audit-events'));
    const actions = audit.items.map((e) => e.action);
    expect(actions).toContain('profile.partners_created');
    expect(actions).toContain('profile.partner_updated');
    expect(JSON.stringify(audit.items)).not.toContain('private note text');
  });

  it('requires a session for every profile route', async () => {
    server = makeTestServer();
    for (const path of ['/api/v1/partners', '/api/v1/skills', '/api/v1/evidence', '/api/v1/studio-profile', '/api/v1/shared/status']) {
      expect((await server.req(path)).status, path).toBe(401);
    }
    const cookie = await server.login();
    expect((await server.req('/api/v1/studio-profile', { cookie })).status).toBe(409);
  });
});

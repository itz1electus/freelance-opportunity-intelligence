import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvidenceView, PartnerView } from '@foi/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTestServer } from './helpers.ts';

const open: Array<ReturnType<typeof makeTestServer>> = [];
afterEach(() => {
  while (open.length) open.pop()!.close();
});

type Json = Record<string, unknown>;
const json = async <T = Json>(res: Response) => (await res.json()) as T;

async function start(dataDir?: string) {
  const server = makeTestServer({ dataDir });
  open.push(server);
  const cookie = await server.login();
  const call = (path: string, method = 'GET', body?: unknown) => server.req(`/api/v1${path}`, { method, body, cookie });
  return { server, call, shared: join(server.dataDir, 'shared') };
}

const skill = { proficiency: 'expert', lastUsedYear: 2025, notes: 'Mostly DAX measures' };

/** A realistic but fictional studio. */
async function populated() {
  const ctx = await start();
  const { call } = ctx;
  const { items } = await json<{ items: PartnerView[] }>(
    await call('/setup/partners', 'POST', { partnerA: { displayName: 'Test Partner A' }, partnerB: { displayName: 'Test Partner B' } }),
  );
  const [a, b] = items as [PartnerView, PartnerView];
  await call(`/partners/${a.id}`, 'PATCH', {
    weeklyHours: 25,
    exclusions: ['No on-site work'],
    qualifications: [{ name: 'Example Cloud Certificate', issuer: 'Example Issuer', year: 2024, url: null }],
    notes: 'Fictional test partner',
  });
  await call(`/partners/${b.id}`, 'PATCH', { weeklyHours: 20 });
  await call('/skills', 'POST', { label: 'Microsoft Fabric', category: 'data_bi', aliases: ['MS Fabric'] });
  await call(`/partners/${a.id}/skills/power-bi`, 'PUT', skill);
  await call(`/partners/${a.id}/skills/microsoft-fabric`, 'PUT', { ...skill, notes: null });
  await call(`/partners/${b.id}/skills/aws-lambda`, 'PUT', { proficiency: 'advanced', lastUsedYear: null, notes: null });
  await call(`/partners/${a.id}/services/data-analysis-bi`, 'PUT', { deliverables: ['Dashboards', 'Data models'], limitations: null });
  const ev = await json<EvidenceView>(
    await call('/evidence', 'POST', {
      title: 'Fictional retail dashboard',
      type: 'client_project',
      url: 'https://example.com/case-study',
      summary: 'Synthetic test evidence',
      claims: ['Cut monthly reporting from 3 days to 2 hours'],
      skillKeys: ['power-bi', 'aws-lambda'],
      verifiedLevel: 'public_link',
      credits: [
        { partnerId: a.id, contributionNotes: 'Report design' },
        { partnerId: b.id, contributionNotes: 'Data loading' },
      ],
    }),
  );
  return { ...ctx, a, b, ev };
}

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name).slice(dir.length + 1))
    .sort();

describe('data/shared export (D-025, ADR-024)', () => {
  it('writes readable, sorted JSON files and leaves other files alone', async () => {
    const { shared, ev } = await populated();
    writeFileSync(join(shared, 'NOTES.txt'), 'team notes');
    expect(listFiles(shared)).toEqual(
      [
        'NOTES.txt',
        'evidence/' + ev.id + '.json',
        'foi-shared.json',
        'partners/a.json',
        'partners/b.json',
        'studio/current.json',
        'taxonomy/skills.json',
      ].sort(),
    );
    const a = readFileSync(join(shared, 'partners/a.json'), 'utf8');
    expect(a.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(a) as Json;
    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
    expect(parsed.displayName).toBe('Test Partner A');
    expect(JSON.parse(readFileSync(join(shared, 'taxonomy/skills.json'), 'utf8'))).toMatchObject({
      skills: [{ key: 'microsoft-fabric', label: 'Microsoft Fabric' }],
    });
    expect(readFileSync(join(shared, 'NOTES.txt'), 'utf8')).toBe('team notes');
  });

  it('only rewrites files whose content changed', async () => {
    const { shared, a, call } = await populated();
    const b = join(shared, 'partners/b.json');
    const before = statSync(b).mtimeMs;
    const bText = readFileSync(b, 'utf8');
    await new Promise((r) => setTimeout(r, 20));
    await call(`/partners/${a.id}`, 'PATCH', { weeklyHours: 26 });
    expect(readFileSync(b, 'utf8')).toBe(bText);
    expect(statSync(b).mtimeMs).toBe(before);
    expect((JSON.parse(readFileSync(join(shared, 'partners/a.json'), 'utf8')) as { weeklyHours: number }).weeklyHours).toBe(26);
  });

  it('removes the file of deleted evidence', async () => {
    const { shared, ev, call } = await populated();
    await call(`/evidence/${ev.id}`, 'DELETE');
    expect(existsSync(join(shared, `evidence/${ev.id}.json`))).toBe(false);
  });

  it('P2-09: exporting and importing into an empty database reproduces the team data exactly', async () => {
    const first = await populated();
    const partners = await json<{ items: PartnerView[] }>(await first.call('/partners'));
    const evidence = await json<{ items: EvidenceView[] }>(await first.call('/evidence'));
    const studio = await json<{ revision: { id: string; contentHash: string; materialHash: string } }>(await first.call('/studio-profile'));
    const skills = await json<{ items: Array<{ key: string; origin: string; aliases: string[] }> }>(await first.call('/skills'));

    // A teammate clones the repository: only data/shared arrives, no database.
    const clone = mkdtempSync(join(tmpdir(), 'foi-clone-'));
    cpSync(first.shared, join(clone, 'shared'), { recursive: true });
    const second = await start(clone);

    expect(await json(await second.call('/partners'))).toEqual(partners);
    expect(await json(await second.call('/evidence'))).toEqual(evidence);
    // Same revision identity everywhere; revision numbers and change history are local to each machine.
    const studio2 = await json<{ revision: { id: string; contentHash: string; materialHash: string } }>(await second.call('/studio-profile'));
    const identity = (r: Json) => ({ id: r.id, contentHash: r.contentHash, materialHash: r.materialHash, createdAt: r.createdAt });
    expect(identity(studio2.revision)).toEqual(identity(studio.revision));
    const skills2 = await json<{ items: Array<{ key: string; origin: string; aliases: string[] }> }>(await second.call('/skills'));
    expect(skills2.items.find((s) => s.key === 'microsoft-fabric')).toEqual(skills.items.find((s) => s.key === 'microsoft-fabric'));

    // Nothing was rewritten on import.
    for (const rel of listFiles(first.shared)) {
      expect(readFileSync(join(clone, 'shared', rel), 'utf8'), rel).toBe(readFileSync(join(first.shared, rel), 'utf8'));
    }
    const status = await json<{ shared: { state: string; notice: string } }>(await second.call('/system'));
    expect(status.shared.state).toBe('ok');
    expect(status.shared.notice).toBe('Loaded the team profiles from data/shared.');
    // Fixture rows: profiles never come from demo data; fixture exclusion is tested once demo listings exist (Phase 3).
  });

  it('blocks edits after an outside change, then loads it on request', async () => {
    const { shared, a, call } = await populated();
    const file = join(shared, 'partners/b.json');
    const teammate = JSON.parse(readFileSync(file, 'utf8')) as { weeklyHours: number; profileVersion: number };
    teammate.weeklyHours = 12;
    teammate.profileVersion += 1;
    writeFileSync(file, `${JSON.stringify(teammate, null, 2)}\n`);

    const status = await json<{ state: string }>(await call('/shared/status'));
    expect(status.state).toBe('changed_externally');
    const blocked = await call(`/partners/${a.id}`, 'PATCH', { weeklyHours: 1 });
    expect(blocked.status).toBe(409);
    expect((await json<{ error: { code: string } }>(blocked)).error.code).toBe('SHARED_DATA_CONFLICT');
    expect((JSON.parse(readFileSync(file, 'utf8')) as { weeklyHours: number }).weeklyHours).toBe(12);

    const reload = await call('/shared/reload', 'POST');
    expect(reload.status).toBe(200);
    const partners = await json<{ items: PartnerView[] }>(await call('/partners'));
    expect(partners.items.find((p) => p.slot === 'B')?.weeklyHours).toBe(12);
    expect((await call(`/partners/${a.id}`, 'PATCH', { weeklyHours: 1 })).status).toBe(200);
  });

  it('refuses a file with merge-conflict markers and never overwrites it', async () => {
    const { shared, ev, a, call } = await populated();
    const file = join(shared, `evidence/${ev.id}.json`);
    const conflicted = `<<<<<<< HEAD\n${readFileSync(file, 'utf8')}=======\n{}\n>>>>>>> origin/main\n`;
    writeFileSync(file, conflicted);

    const reload = await call('/shared/reload', 'POST');
    expect(reload.status).toBe(422);
    const body = await json<{ error: { code: string; message: string; details: { file: string } } }>(reload);
    expect(body.error.code).toBe('SHARED_DATA_INVALID');
    expect(body.error.details.file).toBe(`data/shared/evidence/${ev.id}.json`);
    expect(body.error.message).toMatch(/merge-conflict/);

    const blocked = await call(`/partners/${a.id}`, 'PATCH', { weeklyHours: 3 });
    expect(blocked.status).toBe(409);
    expect(readFileSync(file, 'utf8')).toBe(conflicted);
    // The database still holds the last good data.
    expect((await json<{ items: EvidenceView[] }>(await call('/evidence'))).items).toHaveLength(1);
  });

  it('applies an evidence file deleted by a teammate', async () => {
    const { shared, ev, call } = await populated();
    unlinkSync(join(shared, `evidence/${ev.id}.json`));
    await call('/shared/reload', 'POST');
    expect((await json<{ items: EvidenceView[] }>(await call('/evidence'))).items).toEqual([]);
  });

  it('loads outside changes at startup, after backing up the database', async () => {
    const first = await populated();
    const file = join(first.shared, 'partners/a.json');
    const edited = JSON.parse(readFileSync(file, 'utf8')) as { notes: string };
    edited.notes = 'Changed in Git';
    first.server.close();
    open.splice(open.indexOf(first.server), 1);
    writeFileSync(file, `${JSON.stringify(edited, null, 2)}\n`);

    const again = await start(first.server.dataDir);
    const a = await json<PartnerView>(await again.call(`/partners/${first.a.id}`));
    expect(a.notes).toBe('Changed in Git');
    const backups = readdirSync(join(first.server.dataDir, 'backups'));
    expect(backups.some((f) => f.startsWith('foi-before-shared-load-'))).toBe(true);
    const status = await json<{ shared: { notice: string } }>(await again.call('/system'));
    expect(status.shared.notice).toMatch(/^Loaded team changes/);
  });

  it('rejects shared files that reference unknown partners or skills', async () => {
    const { shared, ev, call } = await populated();
    const file = join(shared, `evidence/${ev.id}.json`);
    const bad = JSON.parse(readFileSync(file, 'utf8')) as { skillKeys: string[] };
    bad.skillKeys = ['made-up-skill'];
    writeFileSync(file, JSON.stringify(bad));
    const res = await call('/shared/reload', 'POST');
    expect(res.status).toBe(422);
    expect((await json<{ error: { message: string } }>(res)).error.message).toContain('made-up-skill');
  });
});

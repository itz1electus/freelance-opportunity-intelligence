import {
  EvidenceInputSchema,
  NewSkillSchema,
  PartnerPatchSchema,
  PartnerServiceInputSchema,
  PartnerSkillInputSchema,
  SetupPartnersSchema,
} from '@foi/domain';
import { Hono } from 'hono';
import type { AppDeps, AppEnv } from '../context.ts';
import { readJson } from './json.ts';

/** Phase 2 routes: partners, vocabulary, evidence, studio profile, shared files. */
export function profileRoutes(deps: AppDeps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  const { profiles, shared } = deps;

  api.post('/setup/partners', async (c) => {
    const body = await readJson(c, SetupPartnersSchema);
    if (!body.ok) return body.response;
    return c.json({ items: profiles.setup(body.data, c.get('requestId')) }, 201);
  });

  api.get('/partners', (c) => c.json({ items: profiles.listPartners() }));
  api.get('/partners/:id', (c) => c.json(profiles.getPartner(c.req.param('id'))));

  api.patch('/partners/:id', async (c) => {
    const body = await readJson(c, PartnerPatchSchema);
    if (!body.ok) return body.response;
    return c.json(profiles.patchPartner(c.req.param('id'), body.data, c.get('requestId')));
  });

  api.put('/partners/:id/skills/:skillKey', async (c) => {
    const body = await readJson(c, PartnerSkillInputSchema);
    if (!body.ok) return body.response;
    return c.json(profiles.putSkill(c.req.param('id'), c.req.param('skillKey'), body.data, c.get('requestId')));
  });

  api.delete('/partners/:id/skills/:skillKey', (c) =>
    c.json(profiles.deleteSkill(c.req.param('id'), c.req.param('skillKey'), c.get('requestId'))),
  );

  api.put('/partners/:id/services/:serviceId', async (c) => {
    const body = await readJson(c, PartnerServiceInputSchema);
    if (!body.ok) return body.response;
    return c.json(profiles.putService(c.req.param('id'), c.req.param('serviceId'), body.data, c.get('requestId')));
  });

  api.delete('/partners/:id/services/:serviceId', (c) =>
    c.json(profiles.deleteService(c.req.param('id'), c.req.param('serviceId'), c.get('requestId'))),
  );

  api.get('/skills', (c) => c.json({ items: profiles.listSkills() }));

  api.post('/skills', async (c) => {
    const body = await readJson(c, NewSkillSchema);
    if (!body.ok) return body.response;
    return c.json(profiles.createSkill(body.data, c.get('requestId')), 201);
  });

  api.get('/services', (c) => c.json({ items: profiles.listServices() }));

  api.get('/evidence', (c) => c.json({ items: profiles.listEvidence() }));

  api.post('/evidence', async (c) => {
    const body = await readJson(c, EvidenceInputSchema);
    if (!body.ok) return body.response;
    return c.json(profiles.createEvidence(body.data, c.get('requestId')), 201);
  });

  api.put('/evidence/:id', async (c) => {
    const body = await readJson(c, EvidenceInputSchema);
    if (!body.ok) return body.response;
    return c.json(profiles.updateEvidence(c.req.param('id'), body.data, c.get('requestId')));
  });

  api.delete('/evidence/:id', (c) => {
    profiles.deleteEvidence(c.req.param('id'), c.get('requestId'));
    return c.body(null, 204);
  });

  api.get('/studio-profile', (c) => c.json(profiles.studio()));

  api.get('/studio-profile/revisions', (c) => {
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '20') || 20));
    return c.json({ items: profiles.revisions(limit) });
  });

  api.get('/shared/status', (c) => c.json(shared.status()));

  api.post('/shared/reload', (c) => c.json(shared.reload(c.get('requestId'))));

  return api;
}

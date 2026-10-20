import type { SourceDescriptor } from '@foi/domain';

/**
 * Source registry (spec §3). Phase 1 ships descriptors only; adapters arrive in
 * Phase 3. Every live source is disabled until its credentials, scopes and
 * attestation exist, so nothing here can reach the network (fail closed).
 */
const LIVE_SOURCES: Array<Omit<SourceDescriptor, 'status' | 'enabled' | 'reason' | 'isFixture'>> = [
  { id: 'freelancer', name: 'Freelancer.com', kind: 'marketplace_api' },
  { id: 'upwork', name: 'Upwork', kind: 'marketplace_api' },
  { id: 'web-search', name: 'Web search (Brave)', kind: 'web_search' },
  { id: 'manual', name: 'Manual capture', kind: 'manual' },
];

export function listSources(options: { fixtureMode: boolean }): SourceDescriptor[] {
  const live: SourceDescriptor[] = LIVE_SOURCES.map((s) => ({
    ...s,
    status: 'not_configured',
    enabled: false,
    reason: 'Connector arrives in Phase 3; needs credentials and an access review first.',
    isFixture: false,
  }));
  const fixture: SourceDescriptor = {
    id: 'fixture',
    name: 'Demo listings',
    kind: 'fixture',
    status: options.fixtureMode ? 'demo' : 'blocked',
    enabled: options.fixtureMode,
    reason: options.fixtureMode
      ? 'Synthetic data for trying FOI out. Not real opportunities.'
      : 'Demo mode is off.',
    isFixture: true,
  };
  return [fixture, ...live];
}

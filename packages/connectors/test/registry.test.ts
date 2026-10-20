import { describe, expect, it } from 'vitest';
import { listSources } from '../src/index.ts';

describe('P1-07: source registry without credentials', () => {
  it('enables only the demo source in fixture mode', () => {
    const sources = listSources({ fixtureMode: true });
    expect(sources.filter((s) => s.enabled).map((s) => s.id)).toEqual(['fixture']);
    for (const s of sources.filter((x) => !x.isFixture)) {
      expect(s.status).toBe('not_configured');
      expect(s.reason.length).toBeGreaterThan(0);
    }
  });

  it('enables nothing when demo mode is off and no credentials exist', () => {
    expect(listSources({ fixtureMode: false }).filter((s) => s.enabled)).toEqual([]);
  });
});

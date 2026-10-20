import { describe, expect, it } from 'vitest';
import { ExternalUrlSchema, SEARCH_LIMITS, SearchRequestSchema } from '../src/index.ts';

describe('source contracts', () => {
  it('accepts only http(s) URLs for listings (SEC-08)', () => {
    expect(ExternalUrlSchema.safeParse('https://www.example.com/jobs/1').success).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://example.com/x']) {
      expect(ExternalUrlSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('caps search inputs on the server side (SEC-15)', () => {
    const base = {
      keywords: ['power bi'],
      excludedKeywords: [],
      serviceIds: [],
      selectedSourceIds: ['fixture'],
      engagements: ['fixed'],
      minAdvertisedBudgets: {},
      targetMarkets: [],
      postedSince: null,
      maxPagesPerSource: 5,
      maxResultsPerSource: 200,
    };
    expect(SearchRequestSchema.safeParse(base).success).toBe(true);
    const tooMany = { ...base, keywords: Array.from({ length: SEARCH_LIMITS.maxKeywords + 1 }, (_, i) => `k${i}`) };
    expect(SearchRequestSchema.safeParse(tooMany).success).toBe(false);
    expect(SearchRequestSchema.safeParse({ ...base, maxPagesPerSource: 1000 }).success).toBe(false);
    expect(SearchRequestSchema.safeParse({ ...base, unexpected: true }).success).toBe(false);
  });
});

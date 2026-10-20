import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGGREGATION_POLICY,
  DEFAULT_BUDGET,
  DEFAULT_COMMERCIAL_FLOORS,
  toBigInt,
  validateAggregationPolicy,
} from '../src/index.ts';

describe('defaults (PROC-02)', () => {
  it('ships a valid aggregation policy', () => {
    expect(validateAggregationPolicy(DEFAULT_AGGREGATION_POLICY)).toEqual([]);
  });

  it('enforces the baseline frozen semantics', () => {
    const flipped = { ...DEFAULT_AGGREGATION_POLICY, capabilityWeight: 0.4, feasibilityWeight: 0.6 };
    expect(validateAggregationPolicy(flipped)).toContain('Capability must outweigh feasibility (baseline D-014).');
    const credibilityHeavy = {
      ...DEFAULT_AGGREGATION_POLICY,
      feasibilityFactors: { ...DEFAULT_AGGREGATION_POLICY.feasibilityFactors, competition: 0.05, client_credibility: 0.3 },
    };
    expect(validateAggregationPolicy(credibilityHeavy)).toContain(
      'Competition must outweigh client credibility (baseline D-015).',
    );
  });

  it('rejects factor weights that do not sum to 1', () => {
    const broken = {
      ...DEFAULT_AGGREGATION_POLICY,
      capabilityFactors: { ...DEFAULT_AGGREGATION_POLICY.capabilityFactors, skills_coverage: 0.5 },
    };
    expect(validateAggregationPolicy(broken)).toContain('Capability factor weights must sum to 1.');
  });

  it('keeps the confirmed $30 cap and allocation consistent (D-022)', () => {
    const { llm, search, reserve } = DEFAULT_BUDGET.allocations;
    expect(toBigInt(llm) + toBigInt(search) + toBigInt(reserve)).toBe(toBigInt(DEFAULT_BUDGET.monthlyHardCap));
    expect(DEFAULT_BUDGET.monthlyHardCap.minorUnits).toBe('3000');
  });

  it('keeps the confirmed commercial floors (D-010 to D-012)', () => {
    expect(DEFAULT_COMMERCIAL_FLOORS.fixed.minorUnits).toBe('30000');
    expect(DEFAULT_COMMERCIAL_FLOORS.hourly.minorUnits).toBe('2000');
    expect(DEFAULT_COMMERCIAL_FLOORS.monthly_retainer.minorUnits).toBe('50000');
  });
});

/**
 * Single home for numeric defaults (PROC-02). Values marked PROPOSED are editable
 * Settings, not frozen requirements; CONFIRMED values come from the baseline.
 */
import { money, type Money } from './money.ts';

export const CAPABILITY_FACTOR_KEYS = [
  'skills_coverage',
  'portfolio_evidence',
  'similar_delivery_experience',
  'service_alignment',
] as const;

export const FEASIBILITY_FACTOR_KEYS = [
  'competition',
  'economics',
  'capacity_deadline',
  'scope_clarity',
  'client_credibility',
] as const;

export type CapabilityFactorKey = (typeof CAPABILITY_FACTOR_KEYS)[number];
export type FeasibilityFactorKey = (typeof FEASIBILITY_FACTOR_KEYS)[number];
export type FactorKey = CapabilityFactorKey | FeasibilityFactorKey;

/**
 * Aggregation policy (ADR-015): pure arithmetic over stored factor scores.
 * Changing it re-aggregates for free; it never triggers LLM work.
 */
export interface AggregationPolicy {
  version: string;
  capabilityWeight: number;
  feasibilityWeight: number;
  capabilityFactors: Record<CapabilityFactorKey, number>;
  feasibilityFactors: Record<FeasibilityFactorKey, number>;
  minCapabilityCoverage: number;
  minFeasibilityCoverage: number;
  missingFactorPrior: number;
  autoAssessmentMinPriority: number;
  autoAssessmentMinCapability: number;
  autoAssessmentMinFeasibility: number;
  autoAssessmentMinCoverage: number;
  maxAutomaticAssessmentsPerRun: number;
  maxQuickEvaluationsPerRun: number;
}

/** P-001…P-006 and review proposals. All PROPOSED. */
export const DEFAULT_AGGREGATION_POLICY: AggregationPolicy = {
  version: '1.0.0',
  capabilityWeight: 0.6,
  feasibilityWeight: 0.4,
  capabilityFactors: {
    skills_coverage: 0.4,
    portfolio_evidence: 0.3,
    similar_delivery_experience: 0.2,
    service_alignment: 0.1,
  },
  feasibilityFactors: {
    competition: 0.3,
    economics: 0.25,
    capacity_deadline: 0.25,
    scope_clarity: 0.15,
    client_credibility: 0.05,
  },
  minCapabilityCoverage: 0.6,
  minFeasibilityCoverage: 0.5,
  missingFactorPrior: 40,
  autoAssessmentMinPriority: 80,
  autoAssessmentMinCapability: 80,
  autoAssessmentMinFeasibility: 60,
  autoAssessmentMinCoverage: 0.8,
  maxAutomaticAssessmentsPerRun: 5,
  maxQuickEvaluationsPerRun: 50,
};

const EPSILON = 1e-9;

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/**
 * Returns human-readable violations. Enforces the baseline's frozen semantics:
 * capability outweighs feasibility (D-014) and competition outweighs client
 * credibility (D-015).
 */
export function validateAggregationPolicy(p: AggregationPolicy): string[] {
  const errors: string[] = [];
  const all = [
    p.capabilityWeight,
    p.feasibilityWeight,
    ...Object.values(p.capabilityFactors),
    ...Object.values(p.feasibilityFactors),
  ];
  if (all.some((w) => !Number.isFinite(w) || w < 0 || w > 1)) errors.push('Every weight must be between 0 and 1.');
  if (Math.abs(p.capabilityWeight + p.feasibilityWeight - 1) > EPSILON) {
    errors.push('Capability and feasibility weights must sum to 1.');
  }
  if (Math.abs(sum(Object.values(p.capabilityFactors)) - 1) > EPSILON) {
    errors.push('Capability factor weights must sum to 1.');
  }
  if (Math.abs(sum(Object.values(p.feasibilityFactors)) - 1) > EPSILON) {
    errors.push('Feasibility factor weights must sum to 1.');
  }
  if (!(p.capabilityWeight > p.feasibilityWeight)) {
    errors.push('Capability must outweigh feasibility (baseline D-014).');
  }
  if (!(p.feasibilityFactors.competition > p.feasibilityFactors.client_credibility)) {
    errors.push('Competition must outweigh client credibility (baseline D-015).');
  }
  for (const [name, value] of [
    ['minCapabilityCoverage', p.minCapabilityCoverage],
    ['minFeasibilityCoverage', p.minFeasibilityCoverage],
    ['autoAssessmentMinCoverage', p.autoAssessmentMinCoverage],
  ] as const) {
    if (!(value > 0 && value <= 1)) errors.push(`${name} must be greater than 0 and at most 1.`);
  }
  for (const [name, value] of [
    ['missingFactorPrior', p.missingFactorPrior],
    ['autoAssessmentMinPriority', p.autoAssessmentMinPriority],
    ['autoAssessmentMinCapability', p.autoAssessmentMinCapability],
    ['autoAssessmentMinFeasibility', p.autoAssessmentMinFeasibility],
  ] as const) {
    if (!(value >= 0 && value <= 100)) errors.push(`${name} must be between 0 and 100.`);
  }
  for (const [name, value] of [
    ['maxAutomaticAssessmentsPerRun', p.maxAutomaticAssessmentsPerRun],
    ['maxQuickEvaluationsPerRun', p.maxQuickEvaluationsPerRun],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) errors.push(`${name} must be a nonnegative integer.`);
  }
  return errors;
}

/** CONFIRMED commercial floors (D-010, D-011, D-012), compared on gross advertised amounts (P-008). */
export const DEFAULT_COMMERCIAL_FLOORS: Record<'fixed' | 'hourly' | 'monthly_retainer', Money> = {
  fixed: money('USD', '30000'),
  hourly: money('USD', '2000'),
  monthly_retainer: money('USD', '50000'),
};

/** CONFIRMED hard cap and allocation (D-022). Amounts in USD cents. */
export const DEFAULT_BUDGET = {
  monthlyHardCap: money('USD', '3000'),
  allocations: {
    llm: money('USD', '2000'),
    search: money('USD', '500'),
    reserve: money('USD', '500'),
  },
  billingWindow: 'utc_calendar_month' as const,
};

/** CONFIRMED range 40–50 h/week (D-013); 45 is the PROPOSED planning baseline (P-004). */
export const DEFAULT_CAPACITY = {
  studioWeeklyCapHours: 45,
  sensitivityHours: [40, 50] as const,
};

/** PROPOSED session idle timeout (review SEC-03). */
export const SESSION_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/** Launch tokens are single-use and short-lived (ADR-012). */
export const LAUNCH_TOKEN_TTL_MS = 2 * 60 * 1000;

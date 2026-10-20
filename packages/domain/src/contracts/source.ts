/**
 * Provider-neutral source contracts (spec §3). These are FOI's own shapes, not
 * vendor payloads; connectors convert at their boundary.
 */
import { z } from 'zod';
import { MoneyRangeSchema, MoneySchema } from '../money.ts';

export const IsoDateTimeSchema = z.iso.datetime({ offset: false });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const SourceKindSchema = z.enum(['marketplace_api', 'company_api', 'web_search', 'manual', 'fixture']);
export const EngagementTypeSchema = z.enum(['fixed', 'hourly', 'monthly_retainer', 'unknown']);
export const AvailabilitySchema = z.enum(['open', 'closed', 'awarded', 'unknown']);
export const SourceOutcomeSchema = z.enum(['COMPLETE', 'PARTIAL', 'FAILED', 'BLOCKED', 'RATE_LIMITED']);
export const TriStateSchema = z.enum(['pass', 'fail', 'unknown']);
/** Check result with the straddling-range case made explicit (SPEC-05). */
export const CheckResultSchema = z.enum(['pass', 'fail', 'partial', 'unknown']);
export const EligibilityStatusSchema = z.enum(['eligible', 'ineligible', 'unverified']);

export type SourceKind = z.infer<typeof SourceKindSchema>;
export type EngagementType = z.infer<typeof EngagementTypeSchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;
export type SourceOutcome = z.infer<typeof SourceOutcomeSchema>;
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type EligibilityStatus = z.infer<typeof EligibilityStatusSchema>;

export const ProvenanceSchema = z
  .object({
    sourceField: z.string().min(1).max(200),
    observedAt: IsoDateTimeSchema,
    evidenceKind: z.enum(['source_field', 'source_text', 'operator', 'derived']),
  })
  .strict();

export const ClientSignalsSchema = z
  .object({
    verifiedPayment: z.boolean().nullable(),
    rating: z.number().finite().nullable(),
    completedProjects: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const CompetitionSignalsSchema = z
  .object({
    proposalCount: z.number().int().nonnegative().nullable(),
    proposalBand: z.string().max(50).nullable(),
    activityAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

/** https only; http is accepted but flagged at render time (SEC-08). Other schemes are rejected. */
export const ExternalUrlSchema = z
  .url({ protocol: /^https?$/ })
  .max(2048);

export const ExternalListingSchema = z
  .object({
    sourceId: z.string().min(1),
    externalId: z.string().min(1).max(200).nullable(),
    originalUrl: ExternalUrlSchema,
    canonicalUrl: ExternalUrlSchema,
    title: z.string().min(1).max(500),
    description: z.string().max(50_000).nullable(),
    clientName: z.string().max(300).nullable(),
    engagement: EngagementTypeSchema,
    advertisedBudget: MoneyRangeSchema.nullable(),
    skills: z.array(z.string().min(1).max(100)).max(100),
    postedAt: IsoDateTimeSchema.nullable(),
    deadlineAt: IsoDateTimeSchema.nullable(),
    expectedDuration: z.string().max(200).nullable(),
    locationRestrictions: z.array(z.string().max(100)).max(50),
    availability: AvailabilitySchema,
    competition: CompetitionSignalsSchema,
    client: ClientSignalsSchema,
    provenance: z.record(z.string(), ProvenanceSchema),
    observedAt: IsoDateTimeSchema,
  })
  .strict();

export type ExternalListing = z.infer<typeof ExternalListingSchema>;

/** Server-side caps on operator input (SEC-15). */
export const SEARCH_LIMITS = {
  maxKeywords: 20,
  maxKeywordLength: 100,
  maxPagesPerSource: 10,
  maxResultsPerSource: 500,
} as const;

const Keyword = z.string().trim().min(1).max(SEARCH_LIMITS.maxKeywordLength);

export const SearchRequestSchema = z
  .object({
    keywords: z.array(Keyword).min(1).max(SEARCH_LIMITS.maxKeywords),
    excludedKeywords: z.array(Keyword).max(SEARCH_LIMITS.maxKeywords),
    serviceIds: z.array(z.string().min(1)).max(50),
    selectedSourceIds: z.array(z.string().min(1)).min(1).max(20),
    engagements: z.array(EngagementTypeSchema).min(1),
    minAdvertisedBudgets: z
      .object({
        fixed: MoneySchema.optional(),
        hourly: MoneySchema.optional(),
        monthly_retainer: MoneySchema.optional(),
      })
      .strict(),
    targetMarkets: z.array(z.string().min(2).max(10)).max(50),
    postedSince: IsoDateTimeSchema.nullable(),
    maxPagesPerSource: z.number().int().min(1).max(SEARCH_LIMITS.maxPagesPerSource),
    maxResultsPerSource: z.number().int().min(1).max(SEARCH_LIMITS.maxResultsPerSource),
  })
  .strict();

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

/**
 * Source access policy (spec §3, SEC-14). Technical checks are enforced by code;
 * the legal approval is an operator attestation with a review expiry.
 */
export const SourceAccessPolicySchema = z
  .object({
    sourceId: z.string().min(1),
    version: z.string().min(1),
    authorizationStatus: z.enum(['approved', 'pending', 'denied', 'unknown']),
    allowedMethod: z.enum(['official_api', 'licensed_search_api', 'permitted_feed', 'manual', 'fixture']),
    attestation: z
      .object({
        reference: z.string().min(1).max(500),
        attestedAt: IsoDateTimeSchema,
        reviewExpiresAt: IsoDateTimeSchema,
      })
      .strict()
      .nullable(),
    requiredScopes: z.array(z.string()).max(50),
    allowedHostnames: z.array(z.string().min(1)).max(20),
    requireAttribution: z.boolean(),
    cacheTtlSeconds: z.number().int().nonnegative(),
    persistableFields: z.array(z.string()).max(100),
    canPersistDerivedScores: z.boolean(),
    canShareWithExternalLLM: z.boolean(),
  })
  .strict();

export type SourceAccessPolicy = z.infer<typeof SourceAccessPolicySchema>;

/** What the UI shows for each registered source (UX-08). */
export const SourceStatusSchema = z.enum(['connected', 'needs_attention', 'blocked', 'not_configured', 'demo']);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export interface SourceDescriptor {
  id: string;
  name: string;
  kind: SourceKind;
  status: SourceStatus;
  enabled: boolean;
  /** Plain-language reason shown to the operator, e.g. "Arrives in Phase 3". */
  reason: string;
  isFixture: boolean;
}

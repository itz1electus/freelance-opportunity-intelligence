/** Partner profile contracts (baseline §4.1, spec §2.2). */
import { z } from 'zod';
import { SKILL_KEY_PATTERN } from './taxonomy.ts';

export const PARTNER_SLOTS = ['A', 'B'] as const;
export type PartnerSlot = (typeof PARTNER_SLOTS)[number];

export const PROFICIENCIES = ['foundational', 'working', 'advanced', 'expert'] as const;
export type Proficiency = (typeof PROFICIENCIES)[number];

export const PROFICIENCY_LABEL: Record<Proficiency, string> = {
  foundational: 'Foundational',
  working: 'Working',
  advanced: 'Advanced',
  expert: 'Expert',
};

export const PROFICIENCY_HELP: Record<Proficiency, string> = {
  foundational: 'Has used it; needs support on client work.',
  working: 'Delivers routine client work independently.',
  advanced: 'Leads complex work and makes design choices.',
  expert: 'Deep, proven expertise; can architect and review others.',
};

export const EVIDENCE_TYPES = [
  'client_project',
  'employment_project',
  'personal_project',
  'open_source',
  'publication',
  'course_project',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  client_project: 'Client project',
  employment_project: 'Project at an employer',
  personal_project: 'Personal project',
  open_source: 'Open-source contribution',
  publication: 'Publication or talk',
  course_project: 'Course or thesis project',
};

export const VERIFIED_LEVELS = ['self_reported', 'public_link', 'client_confirmed'] as const;
export type VerifiedLevel = (typeof VERIFIED_LEVELS)[number];

export const VERIFIED_LEVEL_LABEL: Record<VerifiedLevel, string> = {
  self_reported: 'Described only',
  public_link: 'Public link anyone can check',
  client_confirmed: 'Confirmed by the client or employer',
};

/** Hours a partner can give the studio in a typical week; null means unknown. */
export const WeeklyHoursSchema = z.number().int().min(0).max(80).nullable();

const ShortText = (max: number) => z.string().trim().min(1).max(max);
const OptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === '' ? null : v));

export const SkillKeySchema = z.string().regex(SKILL_KEY_PATTERN, 'Not a valid skill key');

const currentYear = () => new Date().getUTCFullYear();

/** https only for evidence links people will click; http is allowed but flagged in the UI. */
export const EvidenceUrlSchema = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .nullable();

export const QualificationSchema = z
  .object({
    name: ShortText(200),
    issuer: OptionalText(200),
    year: z.number().int().min(1970).max(2100).nullable(),
    url: EvidenceUrlSchema,
  })
  .strict();
export type Qualification = z.infer<typeof QualificationSchema>;

export const SetupPartnersSchema = z
  .object({
    partnerA: z.object({ displayName: ShortText(80) }).strict(),
    partnerB: z.object({ displayName: ShortText(80) }).strict(),
  })
  .strict();

export const PartnerPatchSchema = z
  .object({
    expectedProfileVersion: z.number().int().positive().optional(),
    displayName: ShortText(80).optional(),
    weeklyHours: WeeklyHoursSchema.optional(),
    exclusions: z.array(ShortText(300)).max(30).optional(),
    qualifications: z.array(QualificationSchema).max(30).optional(),
    notes: OptionalText(4000).optional(),
  })
  .strict();
export type PartnerPatch = z.infer<typeof PartnerPatchSchema>;

export const PartnerSkillInputSchema = z
  .object({
    proficiency: z.enum(PROFICIENCIES),
    lastUsedYear: z
      .number()
      .int()
      .min(1980)
      .refine((y) => y <= currentYear(), 'Last used year cannot be in the future')
      .nullable(),
    notes: OptionalText(1000),
  })
  .strict();
export type PartnerSkillInput = z.infer<typeof PartnerSkillInputSchema>;

export const PartnerServiceInputSchema = z
  .object({
    deliverables: z.array(ShortText(200)).max(20),
    limitations: OptionalText(1000),
  })
  .strict();
export type PartnerServiceInput = z.infer<typeof PartnerServiceInputSchema>;

export const NewSkillSchema = z
  .object({
    label: ShortText(80),
    category: z.enum(['data_bi', 'ml', 'data_eng', 'cloud', 'devops', 'software', 'other']),
    aliases: z.array(ShortText(80)).max(10).default([]),
  })
  .strict();

const EvidenceCreditSchema = z
  .object({
    partnerId: z.string().min(1).max(64),
    contributionNotes: OptionalText(1000),
  })
  .strict();

export const EvidenceInputSchema = z
  .object({
    title: ShortText(200),
    type: z.enum(EVIDENCE_TYPES),
    url: EvidenceUrlSchema,
    summary: OptionalText(4000),
    claims: z.array(ShortText(300)).max(20),
    skillKeys: z.array(SkillKeySchema).max(40),
    verifiedLevel: z.enum(VERIFIED_LEVELS),
    credits: z
      .array(EvidenceCreditSchema)
      .min(1, 'Credit at least one partner')
      .max(2)
      .refine((c) => new Set(c.map((x) => x.partnerId)).size === c.length, 'Each partner can be credited once'),
  })
  .strict()
  .refine((e) => e.verifiedLevel !== 'public_link' || e.url !== null, {
    message: 'A public link needs a URL',
    path: ['url'],
  });
export type EvidenceInput = z.infer<typeof EvidenceInputSchema>;

// ---------------------------------------------------------------------------
// Read models shared by the server and the web app
// ---------------------------------------------------------------------------

export interface PartnerSkillView {
  skillKey: string;
  label: string;
  category: string;
  proficiency: Proficiency;
  lastUsedYear: number | null;
  notes: string | null;
  evidenceCount: number;
  updatedAt: string;
}

export interface PartnerServiceView {
  serviceId: string;
  name: string;
  deliverables: string[];
  limitations: string | null;
}

export interface PartnerView {
  id: string;
  slot: PartnerSlot;
  displayName: string;
  weeklyHours: number | null;
  exclusions: string[];
  qualifications: Qualification[];
  notes: string | null;
  profileVersion: number;
  updatedAt: string;
  skills: PartnerSkillView[];
  services: PartnerServiceView[];
}

export interface EvidenceView {
  id: string;
  title: string;
  type: EvidenceType;
  url: string | null;
  summary: string | null;
  claims: string[];
  skillKeys: string[];
  verifiedLevel: VerifiedLevel;
  credits: Array<{ partnerId: string; contributionNotes: string | null }>;
  createdAt: string;
  updatedAt: string;
}

export interface SkillView {
  key: string;
  label: string;
  category: string;
  origin: 'seed' | 'operator';
  aliases: string[];
}

export interface ServiceView {
  id: string;
  name: string;
  description: string;
  searchTerms: string[];
  enabled: boolean;
}

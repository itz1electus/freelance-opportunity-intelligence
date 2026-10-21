/**
 * File format of the committed team export in data/shared/ (ADR-020, ADR-024).
 * Plain JSON with sorted keys and two-space indentation, so Git diffs stay small.
 */
import { EVIDENCE_TYPES, PROFICIENCIES, QualificationSchema, VERIFIED_LEVELS } from '@foi/domain';
import { z } from 'zod';

export const SHARED_FORMAT = { format: 'foi-shared', formatVersion: 1 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const Id = z.string().regex(UUID, 'Expected an ID like 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed');
const Iso = z.iso.datetime({ offset: false });
const Text = (max: number) => z.string().max(max);
const SkillKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);

/** Paths FOI owns inside data/shared. Anything else there is left alone. */
export const MANAGED_PATTERNS = [
  /^foi-shared\.json$/,
  /^partners\/[ab]\.json$/,
  /^evidence\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/,
  /^taxonomy\/skills\.json$/,
  /^studio\/current\.json$/,
];
export const MANAGED_DIRS = ['partners', 'evidence', 'taxonomy', 'studio'];

export const isManaged = (rel: string) => MANAGED_PATTERNS.some((p) => p.test(rel));

export const ManifestFileSchema = z
  .object({ format: z.literal('foi-shared'), formatVersion: z.number().int().positive() })
  .strict();

export const PartnerFileSchema = z
  .object({
    id: Id,
    slot: z.enum(['A', 'B']),
    displayName: z.string().min(1).max(80),
    weeklyHours: z.number().int().min(0).max(80).nullable(),
    exclusions: z.array(z.string().min(1).max(300)).max(30),
    qualifications: z.array(QualificationSchema).max(30),
    notes: Text(4000).nullable(),
    profileVersion: z.number().int().positive(),
    createdAt: Iso,
    updatedAt: Iso,
    skills: z
      .array(
        z
          .object({
            key: SkillKey,
            proficiency: z.enum(PROFICIENCIES),
            lastUsedYear: z.number().int().min(1980).max(2100).nullable(),
            notes: Text(1000).nullable(),
            updatedAt: Iso,
          })
          .strict(),
      )
      .max(500),
    services: z
      .array(
        z
          .object({
            serviceId: z.string().min(1).max(60),
            deliverables: z.array(z.string().min(1).max(200)).max(20),
            limitations: Text(1000).nullable(),
            updatedAt: Iso,
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type PartnerFile = z.infer<typeof PartnerFileSchema>;

export const EvidenceFileSchema = z
  .object({
    id: Id,
    title: z.string().min(1).max(200),
    type: z.enum(EVIDENCE_TYPES),
    url: z.url({ protocol: /^https?$/ }).max(2048).nullable(),
    summary: Text(4000).nullable(),
    claims: z.array(z.string().min(1).max(300)).max(20),
    skillKeys: z.array(SkillKey).max(40),
    verifiedLevel: z.enum(VERIFIED_LEVELS),
    credits: z
      .array(z.object({ partnerId: Id, contributionNotes: Text(1000).nullable() }).strict())
      .min(1)
      .max(2),
    createdAt: Iso,
    updatedAt: Iso,
  })
  .strict();
export type EvidenceFile = z.infer<typeof EvidenceFileSchema>;

export const SkillsFileSchema = z
  .object({
    skills: z
      .array(
        z
          .object({
            key: SkillKey,
            label: z.string().min(1).max(80),
            category: z.enum(['data_bi', 'ml', 'data_eng', 'cloud', 'devops', 'software', 'other']),
            aliases: z.array(z.string().min(1).max(80)).max(20),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type SkillsFile = z.infer<typeof SkillsFileSchema>;

export const StudioFileSchema = z
  .object({
    id: Id,
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    materialHash: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: Iso,
  })
  .strict();
export type StudioFile = z.infer<typeof StudioFileSchema>;

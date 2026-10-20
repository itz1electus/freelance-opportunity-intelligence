import { z } from 'zod';

/** Job types (spec §4.3). `fixture_echo` exercises the worker in demo mode only. */
export const JOB_TYPES = [
  'fixture_echo',
  'source_search',
  'normalize_batch',
  'screen_batch',
  'quick_evaluate_batch',
  'generate_assessment',
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export const JobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const FixtureEchoPayloadSchema = z
  .object({
    message: z.string().min(1).max(200),
    /** Simulated work time, capped so a demo job can never hog the worker. */
    delayMs: z.number().int().min(0).max(10_000).default(0),
    /** Fail this many attempts before succeeding, to demonstrate bounded retry. */
    failTimes: z.number().int().min(0).max(5).default(0),
  })
  .strict();

export type FixtureEchoPayload = z.infer<typeof FixtureEchoPayloadSchema>;

export interface JobView {
  id: string;
  jobType: JobType;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  cancelRequested: boolean;
  result: unknown;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

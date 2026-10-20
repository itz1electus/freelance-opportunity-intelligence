import { randomUUID } from 'node:crypto';
import type { JobType } from '@foi/domain';
import type { Logger } from '@foi/infra';
import type { ClaimedJob, JobQueue } from './queue.ts';

/** Thrown by a handler when retrying cannot help (bad payload, policy block). */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export class JobCancelledError extends Error {
  constructor() {
    super('Job cancelled by the operator');
    this.name = 'JobCancelledError';
  }
}

export interface JobContext {
  signal: AbortSignal;
  attempt: number;
}

export type JobHandler = (payload: unknown, ctx: JobContext) => Promise<unknown>;

export interface WorkerOptions {
  leaseMs?: number;
  pollMs?: number;
  owner?: string;
}

/**
 * In-process worker (ADR-021). It only continues work the operator already
 * requested; it never creates discovery work on its own (D-006).
 */
export class Worker {
  readonly owner: string;
  private readonly leaseMs: number;
  private readonly pollMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly queue: JobQueue,
    private readonly handlers: Partial<Record<JobType, JobHandler>>,
    private readonly logger: Logger,
    options: WorkerOptions = {},
  ) {
    this.owner = options.owner ?? `worker-${randomUUID()}`;
    this.leaseMs = options.leaseMs ?? 30_000;
    this.pollMs = options.pollMs ?? 500;
  }

  start(): void {
    this.stopping = false;
    const tick = async () => {
      if (this.stopping) return;
      try {
        // Drain ready work, then wait for the next poll.
        while (!this.stopping && (await this.runOnce())) {
          /* keep going */
        }
      } catch (error) {
        this.logger.error('worker.tick_failed', { error });
      }
      if (!this.stopping) this.timer = setTimeout(() => void (this.running = tick()), this.pollMs);
    };
    this.running = tick();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  /** Claims and runs at most one job. Returns false when nothing was ready. */
  async runOnce(): Promise<boolean> {
    const job = this.queue.claim(this.owner, this.leaseMs);
    if (!job) return false;
    await this.execute(job);
    return true;
  }

  private async execute(job: ClaimedJob): Promise<void> {
    const controller = new AbortController();
    const renew = setInterval(() => {
      const state = this.queue.renew(job.id, this.owner, this.leaseMs);
      if (!state.owned || state.cancelRequested) controller.abort();
    }, Math.max(50, Math.floor(this.leaseMs / 3)));
    const handler = this.handlers[job.jobType];
    try {
      if (!handler) throw new NonRetryableError(`No handler registered for ${job.jobType}`);
      const result = await handler(job.payload, { signal: controller.signal, attempt: job.attempts });
      // Work that finished is kept even if a cancel arrived meanwhile (spec §4.3).
      if (!this.queue.complete(job.id, this.owner, result)) {
        this.logger.warn('worker.lease_lost_before_completion', { jobId: job.id, jobType: job.jobType });
      } else {
        this.logger.info('worker.job_succeeded', { jobId: job.id, jobType: job.jobType, attempt: job.attempts });
      }
    } catch (error) {
      if (error instanceof JobCancelledError || this.queue.renew(job.id, this.owner, this.leaseMs).cancelRequested) {
        this.queue.markCancelled(job.id, this.owner);
        this.logger.info('worker.job_cancelled', { jobId: job.id, jobType: job.jobType });
      } else {
        const retryable = !(error instanceof NonRetryableError);
        const message = error instanceof Error ? error.message : String(error);
        const outcome = this.queue.fail(job.id, this.owner, message, retryable);
        this.logger.warn('worker.job_failed', { jobId: job.id, jobType: job.jobType, attempt: job.attempts, reason: outcome, error: message });
      }
    } finally {
      clearInterval(renew);
    }
  }
}

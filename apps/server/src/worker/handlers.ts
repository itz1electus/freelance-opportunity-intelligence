import { FixtureEchoPayloadSchema, type JobType } from '@foi/domain';
import { JobCancelledError, NonRetryableError, type JobHandler } from './worker.ts';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new JobCancelledError());
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new JobCancelledError());
      },
      { once: true },
    );
  });

/** Demo-only job that proves the queue end to end without touching the network. */
export const fixtureEcho: JobHandler = async (payload, { signal, attempt }) => {
  const parsed = FixtureEchoPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new NonRetryableError('Invalid fixture_echo payload');
  const { message, delayMs, failTimes } = parsed.data;
  if (delayMs > 0) await sleep(delayMs, signal);
  if (attempt <= failTimes) throw new Error(`Simulated transient failure on attempt ${attempt}`);
  return { echo: message, attempt };
};

export const defaultHandlers: Partial<Record<JobType, JobHandler>> = {
  fixture_echo: fixtureEcho,
};

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, silentLogger } from '@foi/infra';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultHandlers } from '../src/worker/handlers.ts';
import { backoffMs, JobQueue } from '../src/worker/queue.ts';
import { NonRetryableError, Worker } from '../src/worker/worker.ts';

let closeDb: (() => void) | null = null;
afterEach(() => closeDb?.());

function setup() {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'foi-q-')), 'foi.sqlite'));
  closeDb = db.close;
  let now = 1_000_000;
  const clock = () => now;
  const queue = new JobQueue(db.sqlite, clock);
  return { db, queue, clock, advance: (ms: number) => (now += ms) };
}

describe('job queue (spec §4.3)', () => {
  it('returns the existing active job for a duplicate dedupe key', () => {
    const { queue } = setup();
    const a = queue.enqueue({ jobType: 'fixture_echo', payload: { message: 'a' }, dedupeKey: 'k' });
    const b = queue.enqueue({ jobType: 'fixture_echo', payload: { message: 'b' }, dedupeKey: 'k' });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.job.id).toBe(a.job.id);
  });

  it('P1-05: a crashed worker’s job is recovered after the lease expires, without double completion', async () => {
    const { queue, advance } = setup();
    const { job } = queue.enqueue({ jobType: 'fixture_echo', payload: { message: 'hi' }, dedupeKey: 'crash' });

    // Worker A claims the job, then "crashes" (never completes or renews).
    const claimedByA = queue.claim('worker-a', 1000);
    expect(claimedByA?.id).toBe(job.id);
    expect(queue.claim('worker-b', 1000)).toBeNull(); // lease still held

    advance(1001);
    const claimedByB = queue.claim('worker-b', 1000);
    expect(claimedByB?.id).toBe(job.id);
    expect(claimedByB?.attempts).toBe(2);

    expect(queue.complete(job.id, 'worker-b', { done: true })).toBe(true);
    // A wakes up late: its completion and failure must both be refused.
    expect(queue.complete(job.id, 'worker-a', { done: 'twice' })).toBe(false);
    expect(queue.fail(job.id, 'worker-a', 'late', true)).toBe('lost');
    const final = queue.get(job.id)!;
    expect(final.status).toBe('succeeded');
    expect(final.result).toEqual({ done: true });
  });

  it('fails a job whose lease expires on its final attempt', () => {
    const { queue, advance } = setup();
    const { job } = queue.enqueue({ jobType: 'fixture_echo', payload: {}, dedupeKey: 'last', maxAttempts: 1 });
    queue.claim('a', 1000);
    advance(1001);
    expect(queue.claim('b', 1000)).toBeNull();
    expect(queue.get(job.id)?.status).toBe('failed');
  });

  it('retries transient failures with backoff and stops non-retryable ones', async () => {
    const { queue, advance } = setup();
    const worker = new Worker(queue, defaultHandlers, silentLogger, { owner: 'w', leaseMs: 5000 });
    const flaky = queue.enqueue({ jobType: 'fixture_echo', payload: { message: 'x', failTimes: 1 }, dedupeKey: 'flaky' }).job;

    expect(await worker.runOnce()).toBe(true);
    expect(queue.get(flaky.id)).toMatchObject({ status: 'queued', attempts: 1 });
    expect(await worker.runOnce()).toBe(false); // waiting for backoff
    advance(backoffMs(1, () => 1) + 1);
    expect(await worker.runOnce()).toBe(true);
    expect(queue.get(flaky.id)).toMatchObject({ status: 'succeeded', attempts: 2, result: { echo: 'x', attempt: 2 } });

    const bad = queue.enqueue({ jobType: 'fixture_echo', payload: { nope: true }, dedupeKey: 'bad' }).job;
    await worker.runOnce();
    expect(queue.get(bad.id)).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('cancels queued jobs at once and running jobs cooperatively', async () => {
    const { queue } = setup();
    const queued = queue.enqueue({ jobType: 'fixture_echo', payload: { message: 'q' }, dedupeKey: 'q' }).job;
    expect(queue.requestCancel(queued.id)?.status).toBe('cancelled');

    const slow = queue.enqueue({ jobType: 'fixture_echo', payload: { message: 's', delayMs: 2000 }, dedupeKey: 's' }).job;
    const worker = new Worker(queue, defaultHandlers, silentLogger, { owner: 'w', leaseMs: 150 });
    const run = worker.runOnce();
    await new Promise((r) => setTimeout(r, 20));
    queue.requestCancel(slow.id);
    await run;
    expect(queue.get(slow.id)?.status).toBe('cancelled');
  });

  it('never runs an unknown job type', async () => {
    const { queue } = setup();
    const job = queue.enqueue({ jobType: 'source_search', payload: {}, dedupeKey: 'u', maxAttempts: 3 }).job;
    await new Worker(queue, {}, silentLogger, { owner: 'w' }).runOnce();
    expect(queue.get(job.id)).toMatchObject({ status: 'failed', attempts: 1 });
    expect(queue.get(job.id)?.lastError).toContain('No handler');
  });

  it('keeps NonRetryableError semantics explicit', () => {
    expect(new NonRetryableError('x')).toBeInstanceOf(Error);
    expect(backoffMs(1, () => 0.5)).toBe(1000);
    expect(backoffMs(20, () => 0.5)).toBe(60_000);
  });
});

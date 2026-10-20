import { LAUNCH_TOKEN_TTL_MS } from '@foi/domain';
import type { Clock } from '../context.ts';
import { randomToken, sha256 } from './tokens.ts';

/**
 * One-time launch tokens (ADR-012). Held in memory only: a restart invalidates
 * every outstanding token, and only hashes are kept.
 */
export class LaunchTokens {
  private readonly pending = new Map<string, number>();

  constructor(
    private readonly clock: Clock,
    private readonly ttlMs: number = LAUNCH_TOKEN_TTL_MS,
  ) {}

  mint(): string {
    this.prune();
    const token = randomToken();
    this.pending.set(sha256(token), this.clock() + this.ttlMs);
    return token;
  }

  /** Returns true exactly once per valid, unexpired token. */
  consume(token: string): boolean {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return false;
    const key = sha256(token);
    const expiresAt = this.pending.get(key);
    this.pending.delete(key);
    return expiresAt !== undefined && expiresAt > this.clock();
  }

  private prune(): void {
    const now = this.clock();
    for (const [key, expiresAt] of this.pending) if (expiresAt <= now) this.pending.delete(key);
  }
}

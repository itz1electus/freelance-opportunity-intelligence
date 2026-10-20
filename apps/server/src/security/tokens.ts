import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 random bits, URL-safe. */
export const randomToken = (): string => randomBytes(32).toString('base64url');

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Constant-time string comparison for secrets of any length. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(sha256(a), 'hex');
  const y = Buffer.from(sha256(b), 'hex');
  return timingSafeEqual(x, y);
}

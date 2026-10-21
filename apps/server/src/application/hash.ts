import { createHash } from 'node:crypto';
import { canonicalJson } from '@foi/domain';

/** SHA-256 of the canonical JSON form, so key order never changes the hash. */
export const hashCanonical = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');

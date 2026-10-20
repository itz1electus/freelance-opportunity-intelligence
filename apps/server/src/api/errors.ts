import type { ErrorCode, ErrorEnvelope } from '@foi/domain';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from '../context.ts';

export function apiError(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Response {
  const body: ErrorEnvelope = {
    error: { code, message, requestId: c.get('requestId') ?? 'unknown', ...(details ? { details } : {}) },
  };
  return c.json(body, status);
}

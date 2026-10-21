import type { Context } from 'hono';
import type { z } from 'zod';
import type { AppEnv } from '../context.ts';
import { apiError } from './errors.ts';

/** Parses and validates a JSON body; returns a ready error response on failure. */
export async function readJson<T extends z.ZodType>(
  c: Context<AppEnv>,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, response: apiError(c, 400, 'VALIDATION_ERROR', 'Request body must be valid JSON.') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(c, 422, 'VALIDATION_ERROR', 'Request body failed validation.', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      }),
    };
  }
  return { ok: true, data: parsed.data };
}

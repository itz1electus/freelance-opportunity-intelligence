import type { ErrorCode } from '@foi/domain';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** An expected failure that maps directly to an API error envelope. */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

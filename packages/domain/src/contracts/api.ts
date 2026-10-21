/** Normalized API error codes (spec §7.5, extended in v1.1.0). */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'AUTH_REQUIRED',
  'ORIGIN_FORBIDDEN',
  'HOST_FORBIDDEN',
  'CSRF_HEADER_REQUIRED',
  'LAUNCH_TOKEN_INVALID',
  'UNSUPPORTED_MEDIA_TYPE',
  'PAYLOAD_TOO_LARGE',
  'SOURCE_NOT_AUTHORIZED',
  'SOURCE_RATE_LIMITED',
  'SOURCE_POLICY_BLOCK',
  'SEARCH_ALREADY_RUNNING',
  'IDEMPOTENCY_CONFLICT',
  'COST_LIMIT_EXCEEDED',
  'PROFILE_INCOMPLETE',
  'EVALUATION_STALE',
  'INSUFFICIENT_EVIDENCE',
  'NOT_FOUND',
  'JOB_CANCELLED',
  'FIXTURE_MODE_ONLY',
  'ALREADY_EXISTS',
  'VERSION_CONFLICT',
  'SHARED_DATA_CONFLICT',
  'SHARED_DATA_INVALID',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

/** Header every state-changing request must carry (ADR-011). */
export const CSRF_HEADER = 'x-foi-request';
export const CSRF_HEADER_VALUE = '1';

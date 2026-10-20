import { CSRF_HEADER, CSRF_HEADER_VALUE, type ErrorEnvelope } from '@foi/domain';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** Lets the app shell switch to the signed-out screen whenever a session ends. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/**
 * Same-origin JSON client. Every state-changing call carries the custom header
 * the server requires (ADR-011); cookies are HttpOnly and never touched here.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (method !== 'GET') headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const envelope = data as Partial<ErrorEnvelope> | null;
    const error = new ApiError(
      res.status,
      envelope?.error?.code ?? 'INTERNAL_ERROR',
      envelope?.error?.message ?? `Request failed with status ${res.status}`,
      envelope?.error?.requestId ?? null,
    );
    if (res.status === 401 && path !== '/auth/launch') unauthorizedListeners.forEach((l) => l());
    throw error;
  }
  return data as T;
}

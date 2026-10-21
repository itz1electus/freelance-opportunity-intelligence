import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './client.ts';

export interface Resource<T> {
  data: T | null;
  error: ApiError | null;
  reload: () => void;
  setData: (value: T) => void;
}

/** Loads a GET endpoint and reloads it on demand. */
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let current = true;
    api<T>(path)
      .then((value) => {
        if (!current) return;
        setData(value);
        setError(null);
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof ApiError ? e : new ApiError(0, 'INTERNAL_ERROR', 'FOI did not respond.', null));
      });
    return () => {
      current = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload, setData };
}

/** Turns any thrown value into a sentence the operator can act on. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const issues = (error.details?.issues as Array<{ path: string; message: string }> | undefined) ?? [];
    if (issues.length > 0) return issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
    return error.message;
  }
  return 'FOI did not respond. Check that it is still running in the terminal.';
}

export class RequestTimeoutError extends Error {
  readonly code = 'REQUEST_TIMEOUT';

  constructor(timeoutMs: number) {
    super(`The request did not finish within ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = 'AbortError';
  }
}

/** Apply a hard deadline to a Supabase request and abort its underlying fetch. */
export async function withRequestTimeout<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = 9_000,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/** Network stalls and Supabase auth refresh failures should be retried, not dead-lettered. */
export function isTransientRequestError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: string; code?: string; status?: number; message?: string };
  if (
    value.code === 'REQUEST_TIMEOUT'
    || value.name === 'AbortError'
    || value.status === 0
    || value.status === 408
    || value.status === 425
    || value.status === 429
    || (value.status !== undefined && value.status >= 500)
  ) return true;
  const message = value.message?.toLowerCase() ?? '';
  return /fetch|network|connection|offline|timeout|timed out|abort|load failed|refresh.{0,24}token|token.{0,24}refresh|auth.{0,24}refresh|refresh.{0,24}auth|lockmanager|lock manager|jwt expired|session.{0,16}expired/i.test(message);
}

export function retryDelayMs(retryCount: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(Math.max(retryCount, 0), 6));
}

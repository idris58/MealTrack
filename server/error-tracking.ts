/**
 * Server error tracking stub — Sentry is not configured for this project.
 * All functions are no-ops kept here so import sites don't need to change.
 */

export async function initServerErrorTracking(): Promise<void> {}

export function captureServerError(
  error: unknown,
  _context?: Record<string, unknown>,
): void {
  if (error instanceof Error) {
    console.error("[ServerErrorTracking]", error.message);
  }
}

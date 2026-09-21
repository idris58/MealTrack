/**
 * Error tracking stub — Sentry is not configured for this project.
 * All functions are no-ops kept here so import sites don't need to change.
 */

export function initErrorTracking(): void {}

export function captureError(
  error: unknown,
  _context?: Record<string, unknown>,
): void {
  if (error instanceof Error) {
    console.error("[ErrorTracking]", error.message);
  }
}

export function setTrackingUser(
  _user: { id: string; email?: string } | null,
): void {}

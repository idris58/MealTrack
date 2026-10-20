/**
 * app-badge.ts
 *
 * Manages the PWA app badge (navigator.setAppBadge / clearAppBadge).
 * The badge shows the count of actionable items:
 * - Pending meal-off requests awaiting staff review (manager/coordinator only)
 * - Active (non-dismissed) mess notice
 *
 * The badge is updated reactively whenever the relevant data changes.
 * On browsers that don't support the Badging API the calls are silently skipped.
 */

/** Update the app badge with the given count. Clears if count is 0. */
export function updateAppBadge(count: number): void {
  if (!('setAppBadge' in navigator)) return;

  try {
    if (count > 0) {
      void (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> }).setAppBadge(count);
    } else {
      void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
    }
  } catch {
    // Badging API may throw in insecure contexts or when not installed — ignore.
  }
}

/** Clear the app badge entirely. */
export function clearAppBadge(): void {
  updateAppBadge(0);
}

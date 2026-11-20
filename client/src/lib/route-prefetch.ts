const routeLoaders: Record<string, () => Promise<unknown>> = {
  '/app': () => import('@/pages/dashboard'),
  '/app/members': () => import('@/pages/members'),
  '/app/meals': () => import('@/pages/meals'),
  '/app/expenses': () => import('@/pages/expenses'),
  '/app/reports': () => import('@/pages/reports'),
  '/app/history': () => import('@/pages/history'),
  '/app/changelog': () => import('@/pages/changelog'),
  '/app/settings': () => import('@/pages/settings'),
  '/app/profile': () => import('@/pages/profile'),
};

const prefetchedRoutes = new Set<string>();

export function prefetchRoute(href: string) {
  const path = href.split(/[?#]/, 1)[0];
  const load = routeLoaders[path];
  if (!load || prefetchedRoutes.has(path)) return;

  prefetchedRoutes.add(path);
  void load().catch(() => {
    // A failed prefetch should not break navigation; the lazy route retries on demand.
    prefetchedRoutes.delete(path);
  });
}

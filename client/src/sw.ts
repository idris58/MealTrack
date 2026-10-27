/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { createHandlerBoundToURL } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope;

interface SyncEvent extends ExtendableEvent {
  readonly lastChance: boolean;
  readonly tag: string;
}

type PushPayload = {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
};

cleanupOutdatedCaches();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);

const appShellHandler = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(async ({ event, request, url }) => {
    const response = await appShellHandler({ event, request, url });
    if (url.pathname !== "/shared" && !url.pathname.startsWith("/shared/")) return response;

    const html = await response.text();
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(html.replace(
      /<link\s+rel=["']manifest["'][^>]*>/i,
      '<link rel="manifest" href="/shared-manifest.webmanifest" />',
    ), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }, {
    denylist: [/^\/api\//],
  }),
);

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  if (event.data) {
    try {
      const parsed: unknown = event.data.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as PushPayload;
      }
    } catch {
      payload = { body: "You have a new MealTrack update." };
    }
  }
  const title = typeof payload.title === "string" && payload.title ? payload.title : "MealTrack";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === "string" ? payload.body : undefined,
      icon: typeof payload.icon === "string" ? payload.icon : "/icon-192.png",
      badge: typeof payload.badge === "string" ? payload.badge : "/badge-96.png",
      tag: typeof payload.tag === "string" ? payload.tag : undefined,
      data: {
        url: typeof payload.url === "string" ? payload.url : "/app",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = event.notification.data?.url;
  const targetUrl = new URL(
    typeof rawUrl === "string" ? rawUrl : "/app",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url === targetUrl) {
          return client.focus();
        }
      }

      for (const client of clients) {
        if ("focus" in client && "navigate" in client) {
          return client.navigate(targetUrl).then((c) => c?.focus());
        }
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener("sync", ((event: SyncEvent) => {
  if (event.tag === "mealtrack-sync") {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: "TRIGGER_SYNC" });
        }
      })
    );
  }
}) as EventListener);

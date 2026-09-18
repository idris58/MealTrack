import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type PushMode = "main" | "shared";
type PushStatus = "unsupported" | "default" | "enabled" | "denied" | "working";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

async function getServiceWorkerRegistration() {
  const existingRegistration = await navigator.serviceWorker.getRegistration();
  if (existingRegistration) {
    return existingRegistration;
  }

  return navigator.serviceWorker.register("/sw.js");
}

async function getVapidPublicKey() {
  const response = await fetch("/api/push/vapid-public-key");
  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.publicKey) {
    throw new Error(body?.message || "Push notifications are not configured.");
  }

  return String(body.publicKey);
}

async function getMainAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("Sign in again to enable notifications.");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function getSubscriptionEndpoint(subscription: PushSubscription | null) {
  return subscription?.endpoint ?? "";
}

export async function cleanupPushSubscriptionOnLogout(accessToken?: string | null) {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    const endpoint = getSubscriptionEndpoint(subscription ?? null);
    if (!endpoint) return;

    const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;

    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // Ignore network / cleanup failures during logout
  }
}

async function getServerSubscriptionStatus({
  mode,
  shareToken,
  endpoint,
}: {
  mode: PushMode;
  shareToken?: string;
  endpoint: string;
}) {
  const statusEndpoint =
    mode === "main"
      ? "/api/push/status"
      : `/api/push/shared/${encodeURIComponent(shareToken || "")}/status`;
  const headers =
    mode === "main"
      ? {
          "Content-Type": "application/json",
          ...(await getMainAuthHeaders()),
        }
      : { "Content-Type": "application/json" };

  const response = await fetch(statusEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ endpoint }),
  });
  const body = await response.json().catch(() => null);

  return Boolean(response.ok && body?.subscribed);
}

async function syncSubscription({ mode, shareToken, subscription }: { mode: PushMode; shareToken?: string; subscription: PushSubscription }) {
  const endpoint = mode === "main" ? "/api/push/subscribe" : `/api/push/shared/${encodeURIComponent(shareToken || "")}/subscribe`;
  const headers = mode === "main" ? { "Content-Type": "application/json", ...(await getMainAuthHeaders()) } : { "Content-Type": "application/json" };
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(subscription.toJSON()) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || "Unable to enable notifications.");
}

export function usePushNotifications({
  mode,
  shareToken,
}: {
  mode: PushMode;
  shareToken?: string;
}) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => (isPushSupported() ? Notification.permission : "unsupported"),
  );
  const [hasSubscription, setHasSubscription] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supported = permission !== "unsupported";

  const status = useMemo<PushStatus>(() => {
    if (!supported) return "unsupported";
    if (working) return "working";
    if (permission === "denied") return "denied";
    if (hasSubscription) return "enabled";
    return "default";
  }, [hasSubscription, permission, supported, working]);

  const refreshSubscriptionState = useCallback(async () => {
    if (!isPushSupported()) {
      setPermission("unsupported");
      setHasSubscription(false);
      return;
    }

    setPermission(Notification.permission);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = getSubscriptionEndpoint(subscription ?? null);

      if (!endpoint) {
        setHasSubscription(false);
        return;
      }

      setHasSubscription(
        await getServerSubscriptionStatus({
          mode,
          shareToken,
          endpoint,
        }),
      );
    } catch {
      setHasSubscription(false);
    }
  }, [mode, shareToken]);

  useEffect(() => {
    void refreshSubscriptionState();
  }, [refreshSubscriptionState]);

  const subscribe = async () => {
    if (!isPushSupported()) {
      setPermission("unsupported");
      return;
    }

    setWorking(true);
    setError(null);
    setMessage(null);

    try {
      const nextPermission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;

      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        setError(nextPermission === "denied" ? "Notifications are blocked in this browser." : "Notification permission was not granted.");
        return;
      }

      const publicKey = await getVapidPublicKey();
      const registration = await getServiceWorkerRegistration();
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      await syncSubscription({ mode, shareToken, subscription });

      setHasSubscription(true);
      setMessage("Notifications enabled.");
    } catch (caughtError) {
      const nextError =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to enable notifications.";
      setError(nextError);
    } finally {
      setWorking(false);
    }
  };

  const ensureExistingSubscription = useCallback(async () => {
    if (!isPushSupported() || Notification.permission !== "granted") return false;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return false;
      await syncSubscription({ mode, shareToken, subscription });
      setPermission("granted");
      setHasSubscription(true);
      return true;
    } catch {
      setHasSubscription(false);
      return false;
    }
  }, [mode, shareToken]);

  useEffect(() => {
    if (permission === "granted" && !hasSubscription) void ensureExistingSubscription();
  }, [permission, hasSubscription, ensureExistingSubscription]);

  const unsubscribe = async () => {
    if (!isPushSupported()) {
      setPermission("unsupported");
      return;
    }

    setWorking(true);
    setError(null);
    setMessage(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const endpointValue = getSubscriptionEndpoint(subscription ?? null);

      if (endpointValue) {
        const endpoint =
          mode === "main"
            ? "/api/push/unsubscribe"
            : `/api/push/shared/${encodeURIComponent(shareToken || "")}/unsubscribe`;
        const headers =
          mode === "main"
            ? {
                "Content-Type": "application/json",
                ...(await getMainAuthHeaders()),
              }
            : { "Content-Type": "application/json" };

        await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ endpoint: endpointValue }),
        });
      }

      setHasSubscription(false);
      setMessage("Notifications disabled on this browser.");
    } catch (caughtError) {
      const nextError =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to disable notifications.";
      setError(nextError);
    } finally {
      setWorking(false);
    }
  };

  return {
    supported,
    status,
    permission,
    hasSubscription,
    working,
    error,
    message,
    subscribe,
    unsubscribe,
    refreshSubscriptionState,
    ensureExistingSubscription,
  };
}

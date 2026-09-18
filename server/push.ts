import cron from "node-cron";
import webpush, { type PushSubscription } from "web-push";

import { assertSupabaseAdmin, supabaseAdmin } from "./supabase-admin";

type PushAudience = "main" | "shared";
type NotificationType = "meal_log_reminder" | "notice_posted";

type PushSubscriptionBody = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type ActiveCycleRow = {
  id: string;
  user_id: string;
  mess_id: string | null;
};

type ReminderProfileRow = {
  id: string;
  mess_id: string | null;
  reminder_time: string | null;
  notification_preferences: unknown;
};

type NotificationPreferences = {
  global?: boolean;
  categories?: { notices?: boolean; mealReminders?: boolean };
};

function parseNotificationPreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as NotificationPreferences;
}

function allowsNotification(value: unknown, category: "notices" | "mealReminders") {
  const preferences = parseNotificationPreferences(value);
  if (preferences.global === false) return false;
  return preferences.categories?.[category] !== false;
}

const DEFAULT_TIMEZONE = "Asia/Dhaka";
const NOTIFICATION_DELIVERY_RETENTION_MS = 24 * 60 * 60 * 1000;
let vapidConfigured = false;
let hasLoggedMissingVapid = false;

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey() {
  return getVapidConfig()?.publicKey ?? null;
}

export function isPushConfigured() {
  return Boolean(getVapidConfig());
}

function ensureVapidConfigured() {
  const config = getVapidConfig();

  if (!config) {
    if (!hasLoggedMissingVapid) {
      hasLoggedMissingVapid = true;
      console.warn(
        "Push notifications are disabled. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable Web Push.",
      );
    }
    return false;
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    vapidConfigured = true;
  }

  return true;
}

export function parsePushSubscription(body: PushSubscriptionBody) {
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  return { endpoint, p256dh, auth };
}

function toWebPushSubscription(row: PushSubscriptionRow): PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

async function deleteSubscription(id: string) {
  const supabase = assertSupabaseAdmin();
  const { error } = await supabase.from("push_subscriptions").delete().eq("id", id);

  if (error) {
    console.error("Error deleting stale push subscription:", error);
  }
}

async function sendPushToRows(
  rows: PushSubscriptionRow[],
  payload: {
    title: string;
    body: string;
    url: string;
    tag: string;
  },
) {
  const failedUserIds = new Set<string>();
  if (!ensureVapidConfigured()) {
    rows.forEach((row) => failedUserIds.add(row.user_id));
    return failedUserIds;
  }

  const data = JSON.stringify({
    ...payload,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  });

  const successfulUserIds = new Set<string>();
  const transientFailureUserIds = new Set<string>();

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(toWebPushSubscription(row), data);
        successfulUserIds.add(row.user_id);
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : null;

        if (statusCode === 404 || statusCode === 410) {
          await deleteSubscription(row.id);
          return;
        }

        transientFailureUserIds.add(row.user_id);
        console.error("Error sending push notification:", error);
      }
    }),
  );

  transientFailureUserIds.forEach((userId) => {
    if (!successfulUserIds.has(userId)) {
      failedUserIds.add(userId);
    }
  });

  return failedUserIds;
}

export async function upsertPushSubscription({
  userId,
  audience,
  shareToken,
  subscription,
  userAgent,
}: {
  userId: string;
  audience: PushAudience;
  shareToken?: string | null;
  subscription: { endpoint: string; p256dh: string; auth: string };
  userAgent?: string;
}) {
  const supabase = assertSupabaseAdmin();
  const normalizedShareToken = shareToken ?? null;
  let existingQuery = supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("audience", audience)
    .eq("endpoint", subscription.endpoint);

  existingQuery =
    normalizedShareToken === null
      ? existingQuery.is("share_token", null)
      : existingQuery.eq("share_token", normalizedShareToken);

  const { data: existingSubscription, error: existingError } =
    await existingQuery.maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingSubscription?.id) {
    const { error } = await supabase
      .from("push_subscriptions")
      .update({
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        user_agent: userAgent ?? null,
        updated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existingSubscription.id);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .insert({
      user_id: userId,
      audience,
      share_token: normalizedShareToken,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      user_agent: userAgent ?? null,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    });

  if (error) {
    throw error;
  }
}

export async function removePushSubscription({
  endpoint,
  userId,
  audience,
  shareToken,
}: {
  endpoint: string;
  userId?: string;
  audience?: PushAudience;
  shareToken?: string | null;
}) {
  const supabase = assertSupabaseAdmin();
  let query = supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (audience) {
    query = query.eq("audience", audience);
  }

  if (shareToken !== undefined) {
    query = shareToken === null ? query.is("share_token", null) : query.eq("share_token", shareToken);
  }

  const { error } = await query;

  if (error) {
    throw error;
  }
}

async function getEnabledShareTokenForUser(userId: string) {
  const supabase = assertSupabaseAdmin();
  const { data, error } = await supabase
    .from("share_links")
    .select("token")
    .eq("user_id", userId)
    .eq("is_enabled", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return typeof data?.token === "string" ? data.token : null;
}

function truncateNotificationBody(value: string) {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

async function recordDelivery(userId: string, type: NotificationType, dedupeKey: string) {
  const supabase = assertSupabaseAdmin();
  const { error } = await supabase.from("notification_deliveries").insert({
    user_id: userId,
    type,
    dedupe_key: dedupeKey,
  });

  if (error?.code === "23505") {
    return false;
  }

  if (error) {
    throw error;
  }

  return true;
}

async function removeDelivery(userId: string, type: NotificationType, dedupeKey: string) {
  const supabase = assertSupabaseAdmin();
  const { error } = await supabase
    .from("notification_deliveries")
    .delete()
    .eq("user_id", userId)
    .eq("type", type)
    .eq("dedupe_key", dedupeKey);
  if (error) console.error("Error clearing failed notification delivery:", error);
}

export async function sendNoticePushToSharedSubscribers(
  userId: string,
  notice: { id: string; title: string; content: string; expiresAt: string } | null,
) {
  if (!notice) {
    return;
  }

  const shareToken = await getEnabledShareTokenForUser(userId);
  if (!shareToken) {
    return;
  }

  const deliveryRecorded = await recordDelivery(
    userId,
    "notice_posted",
    `${notice.id}:${notice.expiresAt}`,
  );

  if (!deliveryRecorded) {
    return;
  }

  const supabase = assertSupabaseAdmin();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("audience", "shared")
    .eq("share_token", shareToken);

  if (error) {
    console.error("Error loading shared push subscriptions:", error);
    await removeDelivery(userId, "notice_posted", `${notice.id}:${notice.expiresAt}`);
    return;
  }

  const failedUserIds = await sendPushToRows((data || []) as PushSubscriptionRow[], {
    title: "New MealTrack Notice",
    body: truncateNotificationBody(`${notice.title}: ${notice.content}`),
    url: `/shared/${shareToken}`,
    tag: `notice-${notice.id}`,
  });
  if (failedUserIds.has(userId)) await removeDelivery(userId, "notice_posted", `${notice.id}:${notice.expiresAt}`);
}

/**
 * Send a push notification for a new/updated notice to all mess members with
 * a main-audience push subscription. This ensures every logged-in user in the
 * mess (member, coordinator, manager) gets a push — not just shared-view visitors.
 */
export async function sendNoticePushToMessMembers(
  messId: string | null,
  userId: string,
  notice: { id: string; title: string; content: string; expiresAt: string } | null,
) {
  if (!notice) return;
  if (!messId) return;

  const supabase = assertSupabaseAdmin();

  // Find all profile_ids that belong to this mess
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, notification_preferences")
    .eq("mess_id", messId);

  if (profilesError) {
    console.error("Error loading mess profiles for notice push:", profilesError);
    return;
  }

  const eligibleProfiles = (profiles || []).filter((profile: { id: string; notification_preferences: unknown }) => allowsNotification(profile.notification_preferences, "notices"));
  const profileIds = eligibleProfiles.map((p: { id: string }) => p.id);
  if (profileIds.length === 0) return;

  // Get all main-audience subscriptions for those users
  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", profileIds)
    .eq("audience", "main");

  if (subsError) {
    console.error("Error loading mess push subscriptions for notice:", subsError);
    return;
  }

  const dedupeKey = `main:${messId}:${notice.id}:${notice.expiresAt}`;
  const subscribedUserIds = new Set((subs || []).map((subscription: { user_id: string }) => subscription.user_id));
  const eligibleUserIds = new Set<string>();
  await Promise.all(Array.from(subscribedUserIds, async (recipientId) => {
    if (await recordDelivery(recipientId, "notice_posted", dedupeKey)) eligibleUserIds.add(recipientId);
  }));

  const rowsForDelivery = (subs || []).filter((subscription: { user_id: string }) => eligibleUserIds.has(subscription.user_id)) as PushSubscriptionRow[];
  const failedUserIds = await sendPushToRows(rowsForDelivery, {
    title: `📢 ${notice.title}`,
    body: truncateNotificationBody(notice.content),
    url: `/app`,
    tag: `mess-notice-${notice.id}`,
  });
  await Promise.all(Array.from(failedUserIds, (failedUserId) => removeDelivery(failedUserId, "notice_posted", dedupeKey)));
}

function getLocalDateTime(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.get("year")}-${values.get("month")}-${values.get("day")}`,
    time: `${values.get("hour")}:${values.get("minute")}`,
  };
}

function safeLocalDateTime(timeZone: string | null | undefined, now = new Date()) {
  try {
    return getLocalDateTime(timeZone || DEFAULT_TIMEZONE, now);
  } catch {
    return getLocalDateTime(DEFAULT_TIMEZONE, now);
  }
}

export async function sendMealLogReminders() {
  if (!ensureVapidConfigured()) {
    return;
  }

  const supabase = assertSupabaseAdmin();
  const { data: activeCycles, error: cyclesError } = await supabase
    .from("cycles")
    .select("id, user_id, mess_id")
    .eq("status", "active");

  if (cyclesError) {
    console.error("Error loading active cycles for reminders:", cyclesError);
    return;
  }

  const now = new Date();
  for (const cycle of (activeCycles || []) as ActiveCycleRow[]) {
    let profilesQuery = supabase
      .from("profiles")
      .select("id, mess_id, reminder_time, notification_preferences");
    profilesQuery = cycle.mess_id
      ? profilesQuery.eq("mess_id", cycle.mess_id)
      : profilesQuery.eq("id", cycle.user_id);
    const { data: profiles, error: profilesError } = await profilesQuery;
    if (profilesError) { console.error("Error loading reminder profiles:", profilesError); continue; }

    for (const profile of (profiles || []) as ReminderProfileRow[]) {
      if (!allowsNotification(profile.notification_preferences, "mealReminders")) continue;
      const local = safeLocalDateTime(DEFAULT_TIMEZONE, now);
      const configuredTime = (profile.reminder_time || "22:00").slice(0, 5);
      if (local.time !== configuredTime) continue;

      const { data: subscriptions, error: subscriptionError } = await supabase
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth")
        .eq("user_id", profile.id)
        .eq("audience", "main");
      if (subscriptionError) { console.error("Error loading main push subscriptions:", subscriptionError); continue; }
      const rows = (subscriptions || []) as PushSubscriptionRow[];
      if (rows.length === 0) continue;
      const today = local.date;

    // Scope by mess, not user: a coordinator may have logged today's meals, and
    // those rows carry the coordinator's user_id. Falling back to user_id only
    // covers legacy rows that were never migrated into a mess.
      let mealLogQuery = supabase
      .from("meal_logs")
      .select("id")
      .eq("cycle_id", cycle.id)
      .eq("date", today);

      mealLogQuery = cycle.mess_id
      ? mealLogQuery.eq("mess_id", cycle.mess_id)
      : mealLogQuery.eq("user_id", cycle.user_id);

      const { data: mealLog, error: mealLogError } = await mealLogQuery
      .limit(1)
      .maybeSingle();

      if (mealLogError) {
      console.error("Error checking today's meal logs:", mealLogError);
        continue;
      }

      if (mealLog) continue;

      const deliveryRecorded = await recordDelivery(
      profile.id,
      "meal_log_reminder",
      `${today}:${cycle.id}`,
    ).catch((error) => {
      console.error("Error recording meal reminder delivery:", error);
      return false;
    });

      if (!deliveryRecorded) continue;

      const failedUserIds = await sendPushToRows(rows, {
        title: "Meal log reminder",
        body: "Today's meal has not been logged yet.",
        url: "/app/meals",
        tag: `meal-log-reminder-${today}-${cycle.id}`,
      });
      if (failedUserIds.has(profile.id)) {
        await removeDelivery(profile.id, "meal_log_reminder", `${today}:${cycle.id}`);
      }
    }
  }
}

export async function cleanupOldNotificationDeliveries() {
  const supabase = assertSupabaseAdmin();
  const cutoff = new Date(Date.now() - NOTIFICATION_DELIVERY_RETENTION_MS).toISOString();

  const { error } = await supabase
    .from("notification_deliveries")
    .delete()
    .lt("sent_at", cutoff);

  if (error) {
    console.error("Error deleting old notification deliveries:", error);
  }
}

export function startMealReminderScheduler() {
  if (!supabaseAdmin) {
    console.warn("Meal reminder scheduler disabled. Missing Supabase service role client.");
    return;
  }

  cron.schedule(
    "* * * * *",
    () => {
      void sendMealLogReminders();
    },
  );
}

export function startNotificationDeliveryCleanupScheduler() {
  if (!supabaseAdmin) {
    console.warn("Notification delivery cleanup disabled. Missing Supabase service role client.");
    return;
  }

  void cleanupOldNotificationDeliveries();

  cron.schedule("0 * * * *", () => {
    void cleanupOldNotificationDeliveries();
  });
}
export async function cleanupExpiredSoftDeletes() {
  const supabase = assertSupabaseAdmin();
  const now = new Date().toISOString();

  const { error: expenseError } = await supabase
    .from("expenses")
    .delete()
    .not("deleted_at", "is", null)
    .lte("delete_expires_at", now);

  if (expenseError) {
    console.error("Error deleting expired soft-deleted expenses:", expenseError);
  }

  const { error: memberError } = await supabase
    .from("members")
    .delete()
    .not("deleted_at", "is", null)
    .lte("delete_expires_at", now);

  if (memberError) {
    console.error("Error deleting expired soft-deleted members:", memberError);
  }

  const { error: cycleError } = await supabase
    .from("cycles")
    .delete()
    .eq("status", "closed")
    .not("deleted_at", "is", null)
    .lte("delete_expires_at", now);

  if (cycleError) {
    console.error("Error deleting expired soft-deleted closed cycles:", cycleError);
  }
}

export function startSoftDeleteCleanupScheduler() {
  if (!supabaseAdmin) {
    console.warn("Soft-delete cleanup disabled. Missing Supabase service role client.");
    return;
  }

  void cleanupExpiredSoftDeletes();

  cron.schedule("* * * * *", () => {
    void cleanupExpiredSoftDeletes();
  });
}

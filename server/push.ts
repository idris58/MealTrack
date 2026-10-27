import cron from "node-cron";
import webpush, { type PushSubscription } from "web-push";

import { assertSupabaseAdmin, supabaseAdmin } from "./supabase-admin";
import { isAllowedPushEndpoint } from "./push-endpoint";

type PushAudience = "main" | "shared";
type NotificationType =
  | "meal_log_reminder"
  | "notice_posted"
  | "deposit_recorded"
  | "settlement_pending"
  | "meal_off_request_submitted"
  | "meal_off_request_decided";

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
  role: "manager" | "coordinator" | "member";
  reminder_time: string | null;
  notification_preferences: unknown;
};

type NotificationPreferences = {
  global?: boolean;
  categories?: {
    notices?: boolean;
    mealReminders?: boolean;
    deposits?: boolean;
    settlements?: boolean;
    mealOff?: boolean;
  };
};

function parseNotificationPreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as NotificationPreferences;
}

function allowsNotification(
  value: unknown,
  category: "notices" | "mealReminders" | "deposits" | "settlements" | "mealOff",
) {
  const preferences = parseNotificationPreferences(value);
  if (preferences.global === false) return false;
  return preferences.categories?.[category] !== false;
}

const DEFAULT_TIMEZONE = process.env.NOTIFICATION_TIMEZONE || "Asia/Dhaka";
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
  options: { ttlSeconds?: number } = {},
) {
  const failedUserIds = new Set<string>();
  if (!ensureVapidConfigured()) {
    rows.forEach((row) => failedUserIds.add(row.user_id));
    return failedUserIds;
  }

  const data = JSON.stringify({
    ...payload,
    icon: "/icon-192.png",
    badge: "/badge-96.png",
  });

  const successfulUserIds = new Set<string>();
  const transientFailureUserIds = new Set<string>();
  const staleSubscriptionUserIds = new Set<string>();

  await Promise.all(
    rows.map(async (row) => {
      if (!isAllowedPushEndpoint(row.endpoint)) {
        await deleteSubscription(row.id);
        staleSubscriptionUserIds.add(row.user_id);
        return;
      }

      try {
        await webpush.sendNotification(
          toWebPushSubscription(row),
          data,
          options.ttlSeconds === undefined ? undefined : { TTL: options.ttlSeconds },
        );
        successfulUserIds.add(row.user_id);
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : null;

        if (statusCode === 404 || statusCode === 410) {
          await deleteSubscription(row.id);
          staleSubscriptionUserIds.add(row.user_id);
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
  staleSubscriptionUserIds.forEach((userId) => {
    if (!successfulUserIds.has(userId)) {
      failedUserIds.add(userId);
    }
  });

  return failedUserIds;
}

export async function upsertPushSubscription({
  userId,
  messId,
  audience,
  shareToken,
  subscription,
  userAgent,
}: {
  userId: string;
  messId?: string | null;
  audience: PushAudience;
  shareToken?: string | null;
  subscription: { endpoint: string; p256dh: string; auth: string };
  userAgent?: string;
}) {
  const supabase = assertSupabaseAdmin();
  const normalizedShareToken = shareToken ?? null;

  // On a shared device/browser, if another account was previously registered with this endpoint,
  // unlink the previous user's main subscription so they do not receive future notifications on this device.
  if (audience === "main") {
    const { error: unlinkError } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", subscription.endpoint)
      .eq("audience", "main")
      .neq("user_id", userId);

    if (unlinkError) {
      console.error("Error unlinking previous account push subscription on device:", unlinkError);
    }
  }

  let existingQuery = supabase
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("audience", audience)
    .eq("endpoint", subscription.endpoint);

  if (audience === "shared" && messId) {
    existingQuery = existingQuery.eq("mess_id", messId);
  }

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
      mess_id: messId ?? null,
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
  messId,
  audience,
  shareToken,
}: {
  endpoint: string;
  userId?: string;
  messId?: string | null;
  audience?: PushAudience;
  shareToken?: string | null;
}) {
  const supabase = assertSupabaseAdmin();
  let query = supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (messId) {
    query = query.eq("mess_id", messId);
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

async function getEnabledShareTokenForMess(messId: string) {
  const supabase = assertSupabaseAdmin();
  const { data, error } = await supabase
    .from("share_links")
    .select("token, user_id")
    .eq("mess_id", messId)
    .eq("is_enabled", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return typeof data?.token === "string" && typeof data?.user_id === "string"
    ? { token: data.token, ownerUserId: data.user_id }
    : null;
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
  messId: string | null,
  notice: { id: string; title: string; content: string; expiresAt: string } | null,
) {
  if (!notice) {
    return;
  }

  if (!messId) return;

  const shareLink = await getEnabledShareTokenForMess(messId);
  if (!shareLink) {
    return;
  }
  const { token: shareToken, ownerUserId } = shareLink;

  const deliveryRecorded = await recordDelivery(
    ownerUserId,
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
    .eq("mess_id", messId)
    .eq("audience", "shared")
    .eq("share_token", shareToken);

  if (error) {
    console.error("Error loading shared push subscriptions:", error);
    await removeDelivery(ownerUserId, "notice_posted", `${notice.id}:${notice.expiresAt}`);
    return;
  }

  const failedUserIds = await sendPushToRows((data || []) as PushSubscriptionRow[], {
    title: "New MealTrack Notice",
    body: truncateNotificationBody(`${notice.title}: ${notice.content}`),
    url: `/shared/${shareToken}`,
    tag: `notice-${notice.id}`,
  });
  if (failedUserIds.size > 0) await removeDelivery(ownerUserId, "notice_posted", `${notice.id}:${notice.expiresAt}`);
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
  await sendPushToRows(rowsForDelivery, {
    title: `📢 ${notice.title}`,
    body: truncateNotificationBody(notice.content),
    url: `/app`,
    tag: `mess-notice-${notice.id}`,
  });
}

async function sendPushToUser(
  userId: string,
  type: NotificationType,
  dedupeKey: string,
  payload: { title: string; body: string; url: string; tag: string },
) {
  const deliveryRecorded = await recordDelivery(userId, type, dedupeKey);
  if (!deliveryRecorded) return false;

  const supabase = assertSupabaseAdmin();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("audience", "main");

  if (error || !subs || subs.length === 0) {
    return false;
  }

  const failedUserIds = await sendPushToRows(subs as PushSubscriptionRow[], payload);
  if (failedUserIds.has(userId)) {
    await removeDelivery(userId, type, dedupeKey);
    return false;
  }
  return true;
}

export async function sendDepositPush({
  actorUserId,
  messId,
  deposit,
}: {
  actorUserId: string;
  messId: string;
  deposit: { id: string; member_id: string; amount: number | string; note: string | null };
}) {
  const { id: depositId, member_id: memberId, amount: rawAmount, note } = deposit;
  const amount = Number(rawAmount);
  // Skip carry-forward automated deposits to avoid spam
  if (note && note.trim().toLowerCase().startsWith("carry-forward")) {
    return;
  }

  const supabase = assertSupabaseAdmin();
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, name, profile_id")
    .eq("id", memberId)
    .eq("mess_id", messId)
    .maybeSingle();

  // Unlinked members have no profile_id: skip silently
  if (memberError || !member || !member.profile_id) {
    return;
  }

  // Skip push if actor and member are the same person
  if (member.profile_id === actorUserId) {
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", member.profile_id)
    .eq("mess_id", messId)
    .maybeSingle();

  if (!allowsNotification(profile?.notification_preferences, "deposits")) {
    return;
  }

  const formattedAmount = Math.abs(amount).toFixed(amount % 1 === 0 ? 0 : 2);
  const noteSuffix = note?.trim() ? ` (${note.trim()})` : "";
  const isPositive = amount > 0;
  const title = isPositive ? "Deposit Recorded" : "Deposit Adjusted";
  const body = isPositive
    ? `৳${formattedAmount} has been deposited to your account${noteSuffix}.`
    : `৳${formattedAmount} was deducted from your account${noteSuffix}.`;

  await sendPushToUser(
    member.profile_id,
    "deposit_recorded",
    `deposit:${depositId}`,
    {
      title: `💰 ${title}`,
      body: truncateNotificationBody(body),
      url: "/app/members",
      tag: `deposit-${depositId}`,
    },
  );
}

export async function sendSettlementPendingPush({
  actorUserId,
  messId,
  cycleId,
  cycleName,
  dueMembers,
}: {
  actorUserId: string;
  messId: string;
  cycleId: string;
  cycleName: string;
  dueMembers: Array<{ memberId: string; dueAmount: number }>;
}) {
  const validDueMembers = dueMembers.filter((m) => m.dueAmount > 0);
  if (validDueMembers.length === 0) return;

  const supabase = assertSupabaseAdmin();
  const memberIds = validDueMembers.map((m) => m.memberId);
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id, name, profile_id")
    .eq("mess_id", messId)
    .in("id", memberIds);

  if (membersError || !members) return;

  const memberMap = new Map(members.map((m) => [m.id, m]));

  for (const item of validDueMembers) {
    const member = memberMap.get(item.memberId);
    // Unlinked members have no profile_id: skip silently
    if (!member || !member.profile_id) continue;
    // Skip if actor and member are the same person
    if (member.profile_id === actorUserId) continue;

    const { data: profile } = await supabase
      .from("profiles")
      .select("notification_preferences")
      .eq("id", member.profile_id)
      .eq("mess_id", messId)
      .maybeSingle();

    if (!allowsNotification(profile?.notification_preferences, "settlements")) {
      continue;
    }

    const roundedDue = Math.round(item.dueAmount);
    await sendPushToUser(
      member.profile_id,
      "settlement_pending",
      `settlement:${cycleId}:${member.id}`,
      {
        title: "Settlement Pending",
        body: truncateNotificationBody(
          `Cycle "${cycleName}" has ended. You have a due balance of ৳${roundedDue}.`,
        ),
        url: "/app/history",
        tag: `settlement-${cycleId}-${member.id}`,
      },
    );
  }
}

export async function sendMealOffRequestSubmittedPush({
  messId,
  actorUserId,
  requestId,
  memberName,
  startDate,
  endDate,
  mealPeriod,
}: {
  messId: string | null;
  actorUserId: string;
  requestId: string;
  memberName: string;
  startDate: string;
  endDate: string;
  mealPeriod: string;
}) {
  if (!messId) return;

  const supabase = assertSupabaseAdmin();
  // Find mess staff (manager and coordinators) excluding the submitting actor
  const { data: staffProfiles, error: staffError } = await supabase
    .from("profiles")
    .select("id, notification_preferences")
    .eq("mess_id", messId)
    .in("role", ["manager", "coordinator"])
    .neq("id", actorUserId);

  if (staffError || !staffProfiles || staffProfiles.length === 0) return;

  const eligibleStaff = staffProfiles.filter((p) =>
    allowsNotification(p.notification_preferences, "mealOff"),
  );

  const periodLabel = mealPeriod === "all_day" ? "all meals" : mealPeriod;
  const periodText =
    startDate === endDate
      ? `${startDate} (${periodLabel})`
      : `${startDate} to ${endDate} (${periodLabel})`;

  for (const staff of eligibleStaff) {
    await sendPushToUser(
      staff.id,
      "meal_off_request_submitted",
      `meal-off-sub:${requestId}:${staff.id}`,
      {
        title: "New Meal-Off Request",
        body: truncateNotificationBody(`${memberName} requested meal-off for ${periodText}.`),
        url: "/app/meals",
        tag: `meal-off-request-${requestId}`,
      },
    );
  }
}

export async function sendMealOffRequestDecidedPush({
  actorUserId,
  messId,
  requestId,
  status,
  requestedByProfileId,
  startDate,
  endDate,
  mealPeriod,
}: {
  actorUserId: string;
  messId: string;
  requestId: string;
  status: "approved" | "declined";
  requestedByProfileId: string;
  startDate: string;
  endDate: string;
  mealPeriod: string;
}) {
  // Skip if actor and member are the same person
  if (!requestedByProfileId || requestedByProfileId === actorUserId) return;

  const supabase = assertSupabaseAdmin();
  const { data: targetProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, notification_preferences")
    .eq("id", requestedByProfileId)
    .eq("mess_id", messId)
    .maybeSingle();

  if (profileError || !targetProfile) return;
  if (!allowsNotification(targetProfile.notification_preferences, "mealOff")) return;

  const periodLabel = mealPeriod === "all_day" ? "all meals" : mealPeriod;
  const periodText =
    startDate === endDate
      ? `${startDate} (${periodLabel})`
      : `${startDate} to ${endDate} (${periodLabel})`;

  const isApproved = status === "approved";
  const title = isApproved ? "Meal-Off Approved" : "Meal-Off Declined";
  const body = isApproved
    ? `Your meal-off request for ${periodText} was approved.`
    : `Your meal-off request for ${periodText} was declined.`;

  await sendPushToUser(
    targetProfile.id,
    "meal_off_request_decided",
    `meal-off-dec:${requestId}:${status}`,
    {
      title,
      body: truncateNotificationBody(body),
      url: "/app/meals",
      tag: `meal-off-decision-${requestId}`,
    },
  );
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

function isReminderDue(currentTime: string, configuredTime: string) {
  const [currentHour, currentMinute] = currentTime.split(":").map(Number);
  const [configuredHour, configuredMinute] = configuredTime.split(":").map(Number);
  if (![currentHour, currentMinute, configuredHour, configuredMinute].every(Number.isFinite)) return false;

  const currentTotal = currentHour * 60 + currentMinute;
  const configuredTotal = configuredHour * 60 + configuredMinute;
  // A missed cron tick should not suppress the reminder for the rest of the
  // day. notification_deliveries deduplicates repeated scheduler runs.
  const elapsed = currentTotal - configuredTotal;
  return elapsed >= 0;
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

  const cycles = (activeCycles || []) as ActiveCycleRow[];
  if (cycles.length === 0) return;

  const now = new Date();
  const local = safeLocalDateTime(DEFAULT_TIMEZONE, now);
  const messIds = Array.from(new Set(cycles.map((cycle) => cycle.mess_id).filter((id): id is string => Boolean(id))));
  const legacyUserIds = cycles.filter((cycle) => !cycle.mess_id).map((cycle) => cycle.user_id);
  let profilesQuery = supabase
    .from("profiles")
    .select("id, mess_id, role, reminder_time, notification_preferences")
    .lte("reminder_time", `${local.time}:00`);
  if (messIds.length > 0 || legacyUserIds.length > 0) {
    const filters = [
      ...(messIds.length > 0 ? [`mess_id.in.(${messIds.join(",")})`] : []),
      ...(legacyUserIds.length > 0 ? [`id.in.(${legacyUserIds.join(",")})`] : []),
    ];
    profilesQuery = profilesQuery.or(filters.join(","));
  }
  const { data: dueProfiles, error: profilesError } = await profilesQuery;
  if (profilesError) {
    console.error("Error loading profiles due for meal reminders:", profilesError);
    return;
  }

  const profiles = (dueProfiles || []).filter((profile: ReminderProfileRow) =>
    (profile.role === "manager" || profile.role === "coordinator") &&
    allowsNotification(profile.notification_preferences, "mealReminders") &&
    isReminderDue(local.time, (profile.reminder_time || "22:00").slice(0, 5)),
  ) as ReminderProfileRow[];
  if (profiles.length === 0) return;

  const profileIds = profiles.map((profile) => profile.id);
  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", profileIds)
    .eq("audience", "main");
  if (subscriptionError) {
    console.error("Error loading main push subscriptions:", subscriptionError);
    return;
  }
  const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();
  for (const row of (subscriptions || []) as PushSubscriptionRow[]) {
    const rows = subscriptionsByUser.get(row.user_id) || [];
    rows.push(row);
    subscriptionsByUser.set(row.user_id, rows);
  }

  const cycleIds = cycles.map((cycle) => cycle.id);
  const mealLogsQuery = supabase
    .from("meal_logs")
    .select("cycle_id, mess_id, user_id")
    .in("cycle_id", cycleIds)
    .eq("date", local.date);
  const { data: mealLogs, error: mealLogsError } = await mealLogsQuery;
  if (mealLogsError) {
    console.error("Error checking today's meal logs:", mealLogsError);
    return;
  }
  const loggedCycleIds = new Set((mealLogs || []).map((row: { cycle_id: string }) => row.cycle_id));

  const reminderDedupeKeys = Array.from(new Set(
    cycles.filter((cycle) => !loggedCycleIds.has(cycle.id)).map((cycle) => `${local.date}:${cycle.id}`),
  ));
  if (reminderDedupeKeys.length === 0) return;
  const { data: existingDeliveries, error: deliveryLookupError } = await supabase
    .from("notification_deliveries")
    .select("user_id, dedupe_key")
    .in("user_id", profileIds)
    .eq("type", "meal_log_reminder")
    .in("dedupe_key", reminderDedupeKeys);
  if (deliveryLookupError) {
    console.error("Error checking existing meal reminder deliveries:", deliveryLookupError);
    return;
  }
  const deliveredPairs = new Set((existingDeliveries || []).map((row: { user_id: string; dedupe_key: string }) => `${row.user_id}:${row.dedupe_key}`));

  for (const cycle of cycles) {
    if (loggedCycleIds.has(cycle.id)) continue;
    const cycleProfiles = profiles.filter((profile) =>
      cycle.mess_id ? profile.mess_id === cycle.mess_id : profile.id === cycle.user_id,
    );
    for (const profile of cycleProfiles) {
      const rows = subscriptionsByUser.get(profile.id) || [];
      if (rows.length === 0) continue;
      const dedupeKey = `${local.date}:${cycle.id}`;
      if (deliveredPairs.has(`${profile.id}:${dedupeKey}`)) continue;
      const deliveryRecorded = await recordDelivery(profile.id, "meal_log_reminder", dedupeKey).catch((error) => {
        console.error("Error recording meal reminder delivery:", error);
        return false;
      });
      if (!deliveryRecorded) continue;
      const failedUserIds = await sendPushToRows(rows, {
        title: "Meal log reminder",
        body: "Today's meal has not been logged yet.",
        url: "/app/meals",
        tag: `meal-log-reminder-${local.date}-${cycle.id}`,
      }, { ttlSeconds: 15 * 60 });
      if (failedUserIds.has(profile.id)) await removeDelivery(profile.id, "meal_log_reminder", dedupeKey);
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

export async function cleanupExpiredNotices() {
  const supabase = assertSupabaseAdmin();
  const { error } = await supabase
    .from("notices")
    .delete()
    .lte("expires_at", new Date().toISOString());
  if (error) console.error("Error deleting expired notices:", error);
}

export function startMealReminderScheduler() {
  if (!supabaseAdmin) {
    console.warn("Meal reminder scheduler disabled. Missing Supabase service role client.");
    return;
  }

  cron.schedule(
    "* * * * *",
    () => {
      void sendMealLogReminders().catch((error) => {
        console.error("Meal reminder scheduler run failed:", error);
      });
    },
  );
}

export function startNotificationDeliveryCleanupScheduler() {
  if (!supabaseAdmin) {
    console.warn("Notification delivery cleanup disabled. Missing Supabase service role client.");
    return;
  }

  void cleanupOldNotificationDeliveries();
  void cleanupExpiredNotices();

  cron.schedule("0 * * * *", () => {
    void cleanupOldNotificationDeliveries();
    void cleanupExpiredNotices();
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

  const { data: expiredMembers, error: expiredMembersError } = await supabase
    .from("members")
    .select("id")
    .not("deleted_at", "is", null)
    .lte("delete_expires_at", now);

  if (expiredMembersError) {
    console.error("Error loading expired soft-deleted members:", expiredMembersError);
  } else {
    for (const member of expiredMembers ?? []) {
      const [mealHistory, depositHistory] = await Promise.all([
        supabase.from("meal_logs").select("id", { head: true, count: "exact" }).eq("member_id", member.id),
        supabase.from("cycle_deposits").select("id", { head: true, count: "exact" }).eq("member_id", member.id),
      ]);

      if (mealHistory.error || depositHistory.error) {
        // Fail closed: never cascade-delete a member if history could not be checked.
        console.error("Could not verify history before deleting member:", member.id, mealHistory.error ?? depositHistory.error);
        continue;
      }

      if ((mealHistory.count ?? 0) > 0 || (depositHistory.count ?? 0) > 0) {
        // Migrate older soft-deleted members with history to permanent archive state.
        const { error } = await supabase
          .from("members")
          .update({ delete_expires_at: null })
          .eq("id", member.id)
          .not("deleted_at", "is", null);
        if (error) console.error("Error preserving historical member:", member.id, error);
        continue;
      }

      const { error } = await supabase
        .from("members")
        .delete()
        .eq("id", member.id)
        .not("deleted_at", "is", null)
        .lte("delete_expires_at", now);
      if (error) console.error("Error deleting expired member:", member.id, error);
    }
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

  cron.schedule("*/10 * * * *", () => {
    void cleanupExpiredSoftDeletes();
  });
}

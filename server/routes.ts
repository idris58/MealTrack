import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { log } from "./logger";
import { allocateIntegerBalances } from "@shared/settlement-math";

/**
 * Wrap an async Express handler so that rejected promises are caught,
 * logged server-side, and returned as a sanitized JSON error.
 * This prevents raw Supabase / database errors from leaking to the client.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch((err: any) => {
      const status = err.status || err.statusCode || 500;
      const internalMessage =
        err instanceof Error ? err.message : String(err);
      log(`Route error [${req.method} ${req.path}]: ${internalMessage}\n${err.stack || ""}`, "error");

      if (!res.headersSent) {
        res.status(status).json({
          message:
            status >= 500
              ? "An unexpected error occurred. Please try again."
              : internalMessage,
        });
      }
    });
  };
}

import { assertSupabaseAdmin } from "./supabase-admin";
import {
  getVapidPublicKey,
  isPushConfigured,
  parsePushSubscription,
  removePushSubscription,
  sendNoticePushToSharedSubscribers,
  sendNoticePushToMessMembers,
  upsertPushSubscription,
} from "./push";

type MemberRow = {
  id: string;
  name: string;
  avatar: string | null;
};

type SnapshotMember = {
  id: string;
  name: string;
  avatar?: string;
};

type CycleRow = {
  id: string;
  name: string;
  status: "active" | "pending" | "closed";
  started_at: string;
  closed_at: string | null;
  members_snapshot: SnapshotMember[] | null;
};

type ExpenseRow = {
  id: string;
  cycle_id: string;
  amount: number | string;
  description: string;
  type: "meal" | "fixed";
  date: string;
  paid_by: string;
};

type MealLogRow = {
  id: string;
  cycle_id: string;
  date: string;
  member_id: string;
  count: number | string;
};

type CycleDepositRow = {
  id: string;
  cycle_id: string;
  member_id: string;
  amount: number | string;
};

function buildSharedPayload(
  cycle: CycleRow,
  membersData: MemberRow[],
  depositsData: CycleDepositRow[],
  expensesData: ExpenseRow[],
  mealLogsData: MealLogRow[],
) {
  const members =
    cycle.status === "active" || !cycle.members_snapshot
      ? membersData.map((member) => ({
          id: member.id,
          name: member.name,
          avatar: member.avatar || member.name.substring(0, 2).toUpperCase(),
        }))
      : cycle.members_snapshot.map((member) => ({
          id: member.id,
          name: member.name,
          avatar: member.avatar || member.name.substring(0, 2).toUpperCase(),
        }));

  const depositsByMember = new Map<string, number>();
  for (const deposit of depositsData) {
    depositsByMember.set(
      deposit.member_id,
      (depositsByMember.get(deposit.member_id) || 0) + Number(deposit.amount),
    );
  }

  const expenses = expensesData.map((expense) => ({
    id: expense.id,
    amount: Number(expense.amount),
    description: expense.description,
    type: expense.type,
    date: expense.date,
    paidBy: expense.paid_by,
  }));

  const mealLogs = mealLogsData.map((log) => ({
    id: log.id,
    date: log.date,
    memberId: log.member_id,
    count: Number(log.count),
  }));

  const totalMealExpenses = expenses
    .filter((expense) => expense.type === "meal")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const totalFixedExpenses = expenses
    .filter((expense) => expense.type === "fixed")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const totalMealsConsumed = mealLogs.reduce((sum, log) => sum + log.count, 0);
  const memberCount = members.length;
  const currentMealRate =
    totalMealsConsumed > 0 ? totalMealExpenses / totalMealsConsumed : 0;
  const fixedCostPerMember =
    memberCount > 0 ? totalFixedExpenses / memberCount : 0;

  const rawSummaries = members.map((member) => {
    const mealsEaten = mealLogs
      .filter((log) => log.memberId === member.id)
      .reduce((sum, log) => sum + log.count, 0);
    const deposit = depositsByMember.get(member.id) || 0;
    const mealCost = mealsEaten * currentMealRate;
    const fixedCost = fixedCostPerMember;
    const totalCost = mealCost + fixedCost;
    const balance = deposit - totalCost;

    return {
      ...member,
      deposit,
      mealsEaten,
      mealCost,
      fixedCost,
      totalCost,
      balance,
    };
  });

  const totalDeposits = rawSummaries.reduce(
    (sum, member) => sum + member.deposit,
    0,
  );
  const remainingCash = totalDeposits - (totalMealExpenses + totalFixedExpenses);

  const isFinalized = cycle.status === "pending" || cycle.status === "closed";
  let memberSummaries = rawSummaries;

  if (isFinalized && rawSummaries.length > 0) {
    const roundedRemainingCash = Math.round(remainingCash);
    const allocatedMap = allocateIntegerBalances(rawSummaries, roundedRemainingCash);
    memberSummaries = rawSummaries.map((member) => {
      const allocatedBalance = allocatedMap.get(member.id);
      if (allocatedBalance === undefined) return member;
      return {
        ...member,
        balance: allocatedBalance,
      };
    });
  }

  return {
    cycle: {
      id: cycle.id,
      name: cycle.name,
      status: cycle.status,
      closedAt: cycle.closed_at,
    },
    stats: {
      totalDeposits,
      totalMealExpenses,
      totalFixedExpenses,
      totalMealsConsumed,
      currentMealRate,
      fixedCostPerMember,
      remainingCash,
    },
    members: memberSummaries,
    expenses,
    mealLogs,
  };
}

type NoticeRow = {
  id: string;
  title: string;
  content: string;
  expires_at: string;
};

type ActiveNotice = {
  id: string;
  title: string;
  content: string;
  expiresAt: string;
} | null;

type SharedPayload = ReturnType<typeof buildSharedPayload> & {
  activeNotice: ActiveNotice;
};

/**
 * A share scope identifies whose data a public share view exposes. The app uses
 * mess-based multi-tenancy: data rows are owned by a mess and may be written by
 * any operator (manager OR coordinator), so reads MUST be scoped by mess_id.
 * user_id is retained only as a fallback for legacy rows that were never
 * migrated into a mess (mess_id is null).
 */
type Scope = { userId: string; messId: string | null };

/** A stable key identifying a scope, used for the SSE client registry. */
function scopeKey(scope: Scope): string {
  return scope.messId ? `mess:${scope.messId}` : `user:${scope.userId}`;
}

/**
 * The tenancy filter for a scope, as a [column, value] pair to spread into
 * `.eq(...)`. Must be applied before any transform (.order/.limit/.maybeSingle),
 * since .eq lives on the filter builder.
 */
function scopeFilter(scope: Scope): ["mess_id" | "user_id", string] {
  return scope.messId ? ["mess_id", scope.messId] : ["user_id", scope.userId];
}

const shareEventClients = new Map<string, Set<Response>>();
const sharedBroadcastTimers = new Map<string, ReturnType<typeof setTimeout>>();

function addShareEventClient(key: string, res: Response) {
  const clients = shareEventClients.get(key) ?? new Set<Response>();
  clients.add(res);
  shareEventClients.set(key, clients);
}

function removeShareEventClient(key: string, res: Response) {
  const clients = shareEventClients.get(key);
  if (!clients) {
    return;
  }

  clients.delete(res);
  if (clients.size === 0) {
    shareEventClients.delete(key);
  }
}

function sendShareEvent(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastNoticeUpdate(key: string, activeNotice: ActiveNotice) {
  const clients = shareEventClients.get(key);
  if (!clients) {
    return;
  }

  for (const client of Array.from(clients)) {
    sendShareEvent(client, "notice", { activeNotice });
  }
}

function broadcastSharedPayload(key: string, data: SharedPayload | null) {
  const clients = shareEventClients.get(key);
  if (!clients) {
    return;
  }

  for (const client of Array.from(clients)) {
    sendShareEvent(client, "shared-data", { data });
  }
}

async function getActiveNoticeForScope(scope: Scope): Promise<ActiveNotice> {
  const supabaseAdmin = assertSupabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("notices")
    .select("id, title, content, expires_at")
    .eq(...scopeFilter(scope))
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error loading active notice:", error);
    return null;
  }

  const noticeRow = data as NoticeRow | null;
  return noticeRow
    ? {
        id: noticeRow.id,
        title: noticeRow.title,
        content: noticeRow.content,
        expiresAt: noticeRow.expires_at,
      }
    : null;
}

function scheduleSharedBroadcast(scope: Scope) {
  const key = scopeKey(scope);
  if (!shareEventClients.has(key) || sharedBroadcastTimers.has(key)) return;

  const timer = setTimeout(() => {
    sharedBroadcastTimers.delete(key);
    if (!shareEventClients.has(key)) return;
    void getSharedPayloadForScope(scope)
      .then((data) => broadcastSharedPayload(key, data))
      .catch((error) => console.error("Error broadcasting shared update:", error));
  }, 100);
  sharedBroadcastTimers.set(key, timer);
}

async function getSharedPayloadForScope(scope: Scope): Promise<SharedPayload | null> {
  const supabaseAdmin = assertSupabaseAdmin();

  const { data: cycle, error: cycleError } = await supabaseAdmin
    .from("cycles")
    .select("id, name, status, started_at, closed_at, members_snapshot")
    .eq(...scopeFilter(scope))
    .is("deleted_at", null)
    .in("status", ["pending", "active"])
    .order("closed_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cycleError) {
    throw cycleError;
  }

  if (!cycle) {
    return null;
  }

  const [membersResult, depositsResult, expensesResult, mealLogsResult, activeNotice] =
    await Promise.all([
      supabaseAdmin
        .from("members")
        .select("id, name, avatar")
        .eq(...scopeFilter(scope))
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("cycle_deposits")
        .select("id, cycle_id, member_id, amount")
        .eq(...scopeFilter(scope))
        .eq("cycle_id", cycle.id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("expenses")
        .select("id, cycle_id, amount, description, type, date, paid_by")
        .eq(...scopeFilter(scope))
        .eq("cycle_id", cycle.id)
        .is("deleted_at", null)
        .order("date", { ascending: false }),
      supabaseAdmin
        .from("meal_logs")
        .select("id, cycle_id, date, member_id, count")
        .eq(...scopeFilter(scope))
        .eq("cycle_id", cycle.id)
        .order("date", { ascending: false }),
      getActiveNoticeForScope(scope),
    ]);

  if (membersResult.error) {
    throw membersResult.error;
  }

  if (depositsResult.error) {
    throw depositsResult.error;
  }

  if (expensesResult.error) {
    throw expensesResult.error;
  }

  if (mealLogsResult.error) {
    throw mealLogsResult.error;
  }

  return {
    ...buildSharedPayload(
      cycle,
      membersResult.data || [],
      depositsResult.data || [],
      expensesResult.data || [],
      mealLogsResult.data || [],
    ),
    activeNotice,
  };
}

async function getAuthenticatedUserId(authHeader: string | undefined): Promise<string | null> {
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return null;
  }

  const supabaseAdmin = assertSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

/**
 * Resolve the tenancy scope for an authenticated user from their profile. The
 * mess_id — not user_id — determines which data a share view exposes, because
 * coordinators (not just the manager) write rows under the shared mess.
 */
async function resolveScopeForUserId(userId: string): Promise<Scope> {
  const supabaseAdmin = assertSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("mess_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error resolving mess scope for user:", error);
  }

  return { userId, messId: (data?.mess_id as string | null) ?? null };
}

async function requireMessOperator(userId: string) {
  const supabaseAdmin = assertSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role, mess_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.mess_id || (data.role !== "manager" && data.role !== "coordinator")) {
    const error = new Error("Only mess managers and coordinators can broadcast updates.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return data.mess_id as string;
}

async function requireMessMember(userId: string) {
  const supabaseAdmin = assertSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("mess_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.mess_id) {
    const error = new Error("You must belong to a mess to broadcast updates.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return data.mess_id as string;
}

/** Resolve the tenancy scope a share link points at. */
function scopeFromShareLink(shareLink: { user_id: string; mess_id?: string | null }): Scope {
  return { userId: shareLink.user_id, messId: shareLink.mess_id ?? null };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Health-check endpoints ───────────────────────────────────────────────
  // Lightweight probes for load-balancers, uptime monitors, and CI smoke tests.
  // Registered before any middleware that might reject requests (auth, etc.).
  function healthPayload() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV ?? "development",
    };
  }

  app.get("/healthz", (_req, res) => res.status(200).json(healthPayload()));
  app.get("/api/health", (_req, res) => res.status(200).json(healthPayload()));

  app.get("/api/push/vapid-public-key", (_req, res) => {
    const publicKey = getVapidPublicKey();

    if (!publicKey) {
      return res.status(503).json({
        configured: false,
        message: "Push notifications are not configured on this server.",
      });
    }

    return res.json({ configured: true, publicKey });
  });



  app.post("/api/push/subscribe", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));

    if (!userId) {
      return res.status(401).json({ message: "Invalid authorization token." });
    }

    if (!isPushConfigured()) {
      return res.status(503).json({ message: "Push notifications are not configured." });
    }

    const subscription = parsePushSubscription(req.body);
    if (!subscription) {
      return res.status(400).json({ message: "Invalid push subscription." });
    }

    await upsertPushSubscription({
      userId,
      audience: "main",
      subscription,
      userAgent: req.get("user-agent") ?? undefined,
    });

    return res.json({ ok: true });
  }));

  app.post("/api/push/status", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));

    if (!userId) {
      return res.status(401).json({ message: "Invalid authorization token." });
    }

    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
    if (!endpoint) {
      return res.json({ subscribed: false });
    }

    const supabaseAdmin = assertSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("audience", "main")
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return res.json({ subscribed: Boolean(data) });
  }));

  app.post("/api/push/unsubscribe", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));

    if (!userId) {
      return res.status(401).json({ message: "Invalid authorization token." });
    }

    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
    if (!endpoint) {
      return res.status(400).json({ message: "Missing subscription endpoint." });
    }

    await removePushSubscription({
      endpoint,
      userId,
      audience: "main",
      shareToken: null,
    });

    return res.json({ ok: true });
  }));

  app.get("/api/push/preferences", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));
    if (!userId) return res.status(401).json({ message: "Invalid authorization token." });
    const supabaseAdmin = assertSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("reminder_time, notification_preferences")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return res.json({
      reminderTime: String(data?.reminder_time || "22:00").slice(0, 5),
      ...(data?.notification_preferences && typeof data.notification_preferences === "object"
        ? data.notification_preferences
        : {}),
    });
  }));

  app.put("/api/push/preferences", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));
    if (!userId) return res.status(401).json({ message: "Invalid authorization token." });
    const hasReminderTime = Object.prototype.hasOwnProperty.call(req.body ?? {}, "reminderTime");
    const reminderTime = typeof req.body?.reminderTime === "string" ? req.body.reminderTime : "";
    if (hasReminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) return res.status(400).json({ message: "Choose a valid reminder time." });
    const hasGlobal = typeof req.body?.global === "boolean";
    const hasCategories = req.body?.categories && typeof req.body.categories === "object" && !Array.isArray(req.body.categories);
    const categoryInput = hasCategories ? req.body.categories as Record<string, unknown> : {};
    if (req.body?.global !== undefined && !hasGlobal) return res.status(400).json({ message: "Global notification preference must be a boolean." });
    for (const key of ["notices", "mealReminders"]) {
      if (categoryInput[key] !== undefined && typeof categoryInput[key] !== "boolean") return res.status(400).json({ message: "Notification category preferences must be boolean values." });
    }
    const supabaseAdmin = assertSupabaseAdmin();
    const { data: current, error: currentError } = await supabaseAdmin.from("profiles").select("reminder_time, notification_preferences").eq("id", userId).single();
    if (currentError) throw currentError;
    const currentPreferences = current?.notification_preferences && typeof current.notification_preferences === "object" ? current.notification_preferences as Record<string, unknown> : {};
    const currentCategories = currentPreferences.categories && typeof currentPreferences.categories === "object" ? currentPreferences.categories as Record<string, unknown> : {};
    const nextPreferences = {
      ...currentPreferences,
      ...(hasGlobal ? { global: req.body.global } : {}),
      ...(hasCategories ? { categories: { ...currentCategories, ...categoryInput } } : {}),
    };
    const updates: Record<string, unknown> = { notification_preferences: nextPreferences, updated_at: new Date().toISOString() };
    if (hasReminderTime) updates.reminder_time = `${reminderTime}:00`;
    const { data, error } = await supabaseAdmin.from("profiles").update(updates).eq("id", userId).select("reminder_time, notification_preferences").single();
    if (error) throw error;
    return res.json({ reminderTime: String(data.reminder_time || "22:00").slice(0, 5), ...(data.notification_preferences ?? {}) });
  }));

  app.post("/api/push/shared/:token/subscribe", asyncHandler(async (req, res) => {
    const token = String(req.params.token || "").trim();

    if (!token) {
      return res.status(400).json({ message: "Missing share token." });
    }

    if (!isPushConfigured()) {
      return res.status(503).json({ message: "Push notifications are not configured." });
    }

    const subscription = parsePushSubscription(req.body);
    if (!subscription) {
      return res.status(400).json({ message: "Invalid push subscription." });
    }

    const supabaseAdmin = assertSupabaseAdmin();
    const { data: shareLink, error } = await supabaseAdmin
      .from("share_links")
      .select("user_id, mess_id, is_enabled")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!shareLink || !shareLink.is_enabled) {
      return res.status(404).json({ message: "This Meal Code is not available for notifications." });
    }

    await upsertPushSubscription({
      userId: shareLink.user_id,
      messId: shareLink.mess_id,
      audience: "shared",
      shareToken: token,
      subscription,
      userAgent: req.get("user-agent") ?? undefined,
    });

    return res.json({ ok: true });
  }));

  app.post("/api/push/shared/:token/status", asyncHandler(async (req, res) => {
    const token = String(req.params.token || "").trim();
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";

    if (!token || !endpoint) {
      return res.json({ subscribed: false });
    }

    const supabaseAdmin = assertSupabaseAdmin();
    const { data: shareLink, error: shareLinkError } = await supabaseAdmin
      .from("share_links")
      .select("user_id, mess_id, is_enabled")
      .eq("token", token)
      .maybeSingle();

    if (shareLinkError) {
      throw shareLinkError;
    }

    if (!shareLink || !shareLink.is_enabled) {
      return res.json({ subscribed: false });
    }

    const { data, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id")
      .eq("mess_id", shareLink.mess_id)
      .eq("audience", "shared")
      .eq("share_token", token)
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return res.json({ subscribed: Boolean(data) });
  }));

  app.post("/api/push/shared/:token/unsubscribe", asyncHandler(async (req, res) => {
    const token = String(req.params.token || "").trim();
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";

    if (!token || !endpoint) {
      return res.status(400).json({ message: "Missing subscription endpoint." });
    }

    const supabaseAdmin = assertSupabaseAdmin();
    const { data: shareLink, error } = await supabaseAdmin
      .from("share_links")
      .select("user_id, mess_id")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (shareLink) {
      await removePushSubscription({
        endpoint,
        userId: shareLink.user_id,
        messId: shareLink.mess_id,
        audience: "shared",
        shareToken: token,
      });
    }

    return res.json({ ok: true });
  }));

  app.get("/api/share/:token/events", asyncHandler(async (req, res) => {
    const token = String(req.params.token || "").trim();

    if (!token) {
      return res.status(400).json({ message: "Missing share token." });
    }

    const supabaseAdmin = assertSupabaseAdmin();

    const { data: shareLink, error: shareLinkError } = await supabaseAdmin
      .from("share_links")
      .select("user_id, is_enabled, mess_id")
      .eq("token", token)
      .maybeSingle();

    if (shareLinkError) {
      throw shareLinkError;
    }

    if (!shareLink || !shareLink.is_enabled) {
      return res.status(404).json({ message: "This Meal Code is not available for live updates." });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Register under the mess scope so updates from ANY operator in the mess
    // (manager or coordinator) reach this viewer.
    const eventKey = scopeKey(scopeFromShareLink(shareLink));

    addShareEventClient(eventKey, res);
    sendShareEvent(res, "connected", { ok: true });

    const heartbeatId = setInterval(() => {
      sendShareEvent(res, "heartbeat", { at: new Date().toISOString() });
    }, 30000);

    req.on("close", () => {
      clearInterval(heartbeatId);
      removeShareEventClient(eventKey, res);
      res.end();
    });
  }));

  app.post("/api/notices/broadcast", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));

    if (!userId) {
      return res.status(401).json({ message: "Invalid authorization token." });
    }

    await requireMessOperator(userId);

    const scope = await resolveScopeForUserId(userId);
    const activeNotice = await getActiveNoticeForScope(scope);
    broadcastNoticeUpdate(scopeKey(scope), activeNotice);
    // Push to shared-view visitors
    void sendNoticePushToSharedSubscribers(scope.messId, activeNotice);
    // Push to all logged-in mess members (main audience)
    void sendNoticePushToMessMembers(scope.messId, userId, activeNotice);

    return res.json({ activeNotice });
  }));

  app.post("/api/share/broadcast", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));

    if (!userId) {
      return res.status(401).json({ message: "Invalid authorization token." });
    }

    await requireMessMember(userId);

    const scope = await resolveScopeForUserId(userId);
    scheduleSharedBroadcast(scope);

    return res.json({ data: null });
  }));

  app.get("/api/share/:token", asyncHandler(async (req, res) => {
    const token = String(req.params.token || "").trim();

    if (!token) {
      return res.status(400).json({ message: "Missing share token." });
    }

    const supabaseAdmin = assertSupabaseAdmin();

    const { data: shareLink, error: shareLinkError } = await supabaseAdmin
      .from("share_links")
      .select("user_id, is_enabled, mess_id")
      .eq("token", token)
      .maybeSingle();

    if (shareLinkError) {
      throw shareLinkError;
    }

    if (!shareLink) {
      return res.status(404).json({ message: "This Meal Code does not match an active shared view." });
    }

    if (!shareLink.is_enabled) {
      return res.status(404).json({ message: "Sharing is currently disabled for this Meal Code. Ask the manager to enable sharing again." });
    }

    const data = await getSharedPayloadForScope(scopeFromShareLink(shareLink));

    if (!data) {
      return res.status(404).json({ message: "No active or pending cycle is available for this shared view yet." });
    }

    return res.json(data);

  }));

  return httpServer;
}

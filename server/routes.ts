import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import rateLimit from "express-rate-limit";
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
  sendDepositPush,
  sendSettlementPendingPush,
  sendMealOffRequestSubmittedPush,
  sendMealOffRequestDecidedPush,
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

// Share tokens are intentionally short and public, so keep all token-based
// reads and subscription operations behind one per-IP budget. Sharing the
// limiter across these routes prevents bypassing the limit by rotating
// between the data, SSE, and push endpoints.
const sharedTokenRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many shared-view requests. Please try again shortly." },
});

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

  const [membersResult, depositsResult, expensesResult, activeNotice] =
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

  const mealLogRows: MealLogRow[] = [];
  const mealLogPageSize = 1000;
  for (let offset = 0; ; offset += mealLogPageSize) {
    const { data, error } = await supabaseAdmin
      .from("meal_logs")
      .select("id, cycle_id, date, member_id, count")
      .eq(...scopeFilter(scope))
      .eq("cycle_id", cycle.id)
      .order("date", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + mealLogPageSize - 1);
    if (error) throw error;
    const page = (data || []) as MealLogRow[];
    mealLogRows.push(...page);
    if (page.length < mealLogPageSize) break;
  }

  return {
    ...buildSharedPayload(
      cycle,
      membersResult.data || [],
      depositsResult.data || [],
      expensesResult.data || [],
      mealLogRows,
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
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
    for (const key of ["notices", "mealReminders", "deposits", "settlements", "mealOff"]) {
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

  app.post("/api/push/deposit", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));
    if (!userId) return res.status(401).json({ message: "Invalid authorization token." });
    const messId = await requireMessOperator(userId);
    const depositId = typeof req.body?.depositId === "string" ? req.body.depositId : "";
    if (!UUID_PATTERN.test(depositId)) return res.status(400).json({ message: "A valid deposit ID is required." });

    const supabaseAdmin = assertSupabaseAdmin();
    const { data: deposit, error } = await supabaseAdmin
      .from("cycle_deposits")
      .select("id, member_id, amount, note")
      .eq("id", depositId)
      .eq("mess_id", messId)
      .maybeSingle();
    if (error) throw error;
    if (!deposit) return res.status(404).json({ message: "Deposit not found in your mess." });

    void sendDepositPush({ actorUserId: userId, messId, deposit });

    return res.json({ success: true });
  }));

  app.post("/api/push/settlement-pending", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));
    if (!userId) return res.status(401).json({ message: "Invalid authorization token." });
    const messId = await requireMessOperator(userId);
    const cycleId = typeof req.body?.cycleId === "string" ? req.body.cycleId : "";
    if (!UUID_PATTERN.test(cycleId)) return res.status(400).json({ message: "A valid cycle ID is required." });

    const supabaseAdmin = assertSupabaseAdmin();
    const { data: cycle, error: cycleError } = await supabaseAdmin
      .from("cycles")
      .select("id, name, status, members_snapshot")
      .eq("id", cycleId)
      .eq("mess_id", messId)
      .eq("status", "pending")
      .maybeSingle();
    if (cycleError) throw cycleError;
    if (!cycle) return res.status(404).json({ message: "Pending cycle not found in your mess." });

    const roster = Array.isArray(cycle.members_snapshot)
      ? cycle.members_snapshot as SnapshotMember[]
      : null;
    const members = roster ?? await fetchAllPages<{ id: string; name: string }>(async (from, to) =>
      await supabaseAdmin
        .from("members")
        .select("id, name")
        .eq("mess_id", messId)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (members.length === 0) return res.json({ success: true });

    const depositsPromise = fetchAllPages<{ member_id: string; amount: number | string }>(async (from, to) =>
      await supabaseAdmin
        .from("cycle_deposits")
        .select("member_id, amount")
        .eq("mess_id", messId)
        .eq("cycle_id", cycle.id)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const expensesPromise = fetchAllPages<{ amount: number | string; type: "meal" | "fixed" }>(async (from, to) =>
      await supabaseAdmin
        .from("expenses")
        .select("amount, type")
        .eq("mess_id", messId)
        .eq("cycle_id", cycle.id)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const mealLogsPromise = fetchAllPages<{ member_id: string; count: number | string }>(async (from, to) =>
      await supabaseAdmin
        .from("meal_logs")
        .select("member_id, count")
        .eq("mess_id", messId)
        .eq("cycle_id", cycle.id)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const [deposits, expenses, mealLogs] = await Promise.all([depositsPromise, expensesPromise, mealLogsPromise]);

    const memberIds = new Set(members.map((member) => member.id));
    const depositByMember = new Map<string, number>();
    for (const deposit of deposits) {
      if (!memberIds.has(deposit.member_id)) continue;
      depositByMember.set(deposit.member_id, (depositByMember.get(deposit.member_id) ?? 0) + Number(deposit.amount));
    }
    const totalDeposits = Array.from(depositByMember.values()).reduce((sum, amount) => sum + amount, 0);
    const mealExpenses = expenses.filter((expense) => expense.type === "meal").reduce((sum, expense) => sum + Number(expense.amount), 0);
    const fixedExpenses = expenses.filter((expense) => expense.type === "fixed").reduce((sum, expense) => sum + Number(expense.amount), 0);
    const mealCountByMember = new Map<string, number>();
    let totalMeals = 0;
    for (const log of mealLogs) {
      if (!memberIds.has(log.member_id)) continue;
      const count = Number(log.count);
      mealCountByMember.set(log.member_id, (mealCountByMember.get(log.member_id) ?? 0) + count);
      totalMeals += count;
    }
    const mealRate = totalMeals > 0 ? mealExpenses / totalMeals : 0;
    const fixedShare = members.length > 0 ? fixedExpenses / members.length : 0;
    const remainingCash = totalDeposits - mealExpenses - fixedExpenses;
    const rawBalances = members.map((member) => ({
      id: member.id,
      name: member.name,
      balance: (depositByMember.get(member.id) ?? 0) - (mealCountByMember.get(member.id) ?? 0) * mealRate - fixedShare,
    }));
    const allocatedBalances = allocateIntegerBalances(rawBalances, Math.round(remainingCash));
    const dueMembers = rawBalances
      .map((member) => ({ memberId: member.id, dueAmount: Math.abs(allocatedBalances.get(member.id) ?? member.balance) }))
      .filter((member) => (allocatedBalances.get(member.memberId) ?? 0) < 0);

    if (dueMembers.length > 0) {
      void sendSettlementPendingPush({
        actorUserId: userId,
        messId,
        cycleId: cycle.id,
        cycleName: cycle.name,
        dueMembers,
      });
    }

    return res.json({ success: true });
  }));

  app.post("/api/push/meal-off/submit", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));
    if (!userId) return res.status(401).json({ message: "Invalid authorization token." });
    const messId = await requireMessMember(userId);

    const { requestId, memberName, startDate, endDate, mealPeriod } = req.body ?? {};
    if (!requestId || !memberName || !startDate || !endDate || !mealPeriod) {
      return res.status(400).json({ message: "Missing required meal-off request details." });
    }

    void sendMealOffRequestSubmittedPush({
      messId,
      actorUserId: userId,
      requestId: String(requestId),
      memberName: String(memberName),
      startDate: String(startDate),
      endDate: String(endDate),
      mealPeriod: String(mealPeriod),
    });

    return res.json({ success: true });
  }));

  app.post("/api/push/meal-off/decision", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));
    if (!userId) return res.status(401).json({ message: "Invalid authorization token." });
    const messId = await requireMessOperator(userId);
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
    if (!UUID_PATTERN.test(requestId)) return res.status(400).json({ message: "A valid request ID is required." });

    const supabaseAdmin = assertSupabaseAdmin();
    const { data: request, error } = await supabaseAdmin
      .from("meal_off_requests")
      .select("id, status, requested_by_profile_id, start_date, end_date, meal_period")
      .eq("id", requestId)
      .eq("mess_id", messId)
      .in("status", ["approved", "declined"])
      .maybeSingle();
    if (error) throw error;
    if (!request) return res.status(404).json({ message: "Reviewed request not found in your mess." });

    void sendMealOffRequestDecidedPush({
      actorUserId: userId,
      messId,
      requestId: request.id,
      status: request.status as "approved" | "declined",
      requestedByProfileId: request.requested_by_profile_id,
      startDate: request.start_date,
      endDate: request.end_date,
      mealPeriod: request.meal_period,
    });

    return res.json({ success: true });
  }));

  app.post("/api/push/shared/:token/subscribe", sharedTokenRateLimit, asyncHandler(async (req, res) => {
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

  app.post("/api/push/shared/:token/status", sharedTokenRateLimit, asyncHandler(async (req, res) => {
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

  app.post("/api/push/shared/:token/unsubscribe", sharedTokenRateLimit, asyncHandler(async (req, res) => {
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

  app.get("/api/share/:token/events", sharedTokenRateLimit, asyncHandler(async (req, res) => {
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

  app.get("/api/share/:token", sharedTokenRateLimit, asyncHandler(async (req, res) => {
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

import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { log } from "./logger";
import { isAllowedPushEndpoint } from "./push-endpoint";
import { computeCycleMath, selectCycleMembers } from "@shared/cycle-math";

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

function parseRequestBody<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  body: unknown,
  res: Response,
): z.infer<TSchema> | null {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;

  const firstIssue = parsed.error.issues[0];
  res.status(400).json({ message: firstIssue?.message || "Invalid request body." });
  return null;
}

const pushSubscriptionBodySchema = z.object({
  endpoint: z.string().url().max(4096).refine(
    isAllowedPushEndpoint,
    "Push endpoint must use HTTPS with a supported push service.",
  ),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
}).passthrough();
const endpointBodySchema = z.object({ endpoint: z.string().url().max(4096) });
const sharedTokenCleanupSchema = z.object({ oldToken: z.string().trim().min(1).max(32) });
const endpointStatusBodySchema = z.object({
  endpoint: z.string().url().max(4096).optional(),
}).default({});
const notificationPreferencesBodySchema = z.object({
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid reminder time.").optional(),
  global: z.boolean().optional(),
  categories: z.object({
    notices: z.boolean().optional(),
    mealReminders: z.boolean().optional(),
    deposits: z.boolean().optional(),
    settlements: z.boolean().optional(),
    mealOff: z.boolean().optional(),
  }).partial().optional(),
}).strict();
const uuidBodySchema = (key: string, label: string) => z.object({
  [key]: z.string().uuid(`${label} must be a valid ID.`),
});

import { assertSupabaseAdmin } from "./supabase-admin";
import {
  getVapidPublicKey,
  isPushConfigured,
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
  deleted_at: string | null;
  created_at: string | null;
  sort_order: number | null;
};

type SnapshotMember = {
  id: string;
  name: string;
  avatar?: string;
  createdAt?: string | null;
  deletedAt?: string | null;
};

type SettlementSnapshotEntry = { memberId: string; balance: number; deposited: number };

type CycleRow = {
  id: string;
  name: string;
  status: "active" | "pending" | "closed";
  started_at: string;
  closed_at: string | null;
  members_snapshot: SnapshotMember[] | null;
  settlement_snapshot: SettlementSnapshotEntry[] | null;
};

type ExpenseRow = {
  id: string;
  cycle_id: string;
  amount: number | string;
  description: string;
  type: "meal" | "utility";
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
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many shared-view requests. Please try again shortly." },
});

function normalizeShareToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const token = value.trim().toUpperCase();
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(token) ? token : "";
}

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
  const historyMemberIds = [
    ...depositsData.map((deposit) => deposit.member_id),
    ...mealLogsData.map((log) => log.member_id),
  ];
  const members = cycle.status !== "active" && cycle.members_snapshot
    ? cycle.members_snapshot.map((member) => ({
        id: member.id,
        name: member.name,
        avatar: member.avatar || member.name.substring(0, 2).toUpperCase(),
        createdAt: member.createdAt,
        deletedAt: member.deletedAt,
      }))
    : selectCycleMembers(
        membersData.map((member) => ({
          id: member.id,
          name: member.name,
          avatar: member.avatar || member.name.substring(0, 2).toUpperCase(),
          createdAt: member.created_at,
          deletedAt: member.deleted_at,
        })),
        historyMemberIds,
      ).map(({ id, name, avatar }) => ({ id, name, avatar }));

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

  const math = computeCycleMath({
    members,
    deposits: depositsData.map((deposit) => ({ memberId: deposit.member_id, amount: Number(deposit.amount) })),
    expenses: expenses.map((expense) => ({ amount: expense.amount, type: expense.type })),
    mealLogs,
    settlementSnapshot: cycle.settlement_snapshot,
    finalized: cycle.status === "pending" || cycle.status === "closed",
    cycleStartedAt: cycle.started_at,
    cycleEndedAt: cycle.closed_at ?? new Date().toISOString(),
  });

  return {
    cycle: {
      id: cycle.id,
      name: cycle.name,
      status: cycle.status,
      closedAt: cycle.closed_at,
    },
    stats: math.stats,
    members: math.members,
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

// This registry and its debounce timers are process-local. Before running more
// than one web instance, fan out scope updates through Redis Pub/Sub or
// Postgres LISTEN/NOTIFY so every instance with connected SSE clients receives them.
const shareEventClients = new Map<string, Set<Response>>();
const sharedBroadcastTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SHARED_PAYLOAD_CACHE_MS = 3_000;
const sharedPayloadCache = new Map<string, { payload: SharedPayload | null; expiresAt: number }>();
const sharedPayloadLoads = new Map<string, Promise<SharedPayload | null>>();
const sharedPayloadVersions = new Map<string, number>();

function invalidateSharedPayload(scope: Scope) {
  const key = scopeKey(scope);
  sharedPayloadCache.delete(key);
  sharedPayloadVersions.set(key, (sharedPayloadVersions.get(key) ?? 0) + 1);
  sharedPayloadLoads.delete(key);
}

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
  invalidateSharedPayload(scope);
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
  const key = scopeKey(scope);
  const cached = sharedPayloadCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  const pending = sharedPayloadLoads.get(key);
  if (pending) return pending;

  const version = sharedPayloadVersions.get(key) ?? 0;
  const load = loadSharedPayloadForScope(scope);
  sharedPayloadLoads.set(key, load);
  try {
    const payload = await load;
    if ((sharedPayloadVersions.get(key) ?? 0) === version) {
      sharedPayloadCache.set(key, { payload, expiresAt: Date.now() + SHARED_PAYLOAD_CACHE_MS });
    }
    return payload;
  } finally {
    if (sharedPayloadLoads.get(key) === load) sharedPayloadLoads.delete(key);
  }
}

async function loadSharedPayloadForScope(scope: Scope): Promise<SharedPayload | null> {
  const supabaseAdmin = assertSupabaseAdmin();

  const { data: cycle, error: cycleError } = await supabaseAdmin
    .from("cycles")
    .select("id, name, status, started_at, closed_at, members_snapshot, settlement_snapshot")
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
        .select("id, name, avatar, created_at, deleted_at, sort_order")
        .eq(...scopeFilter(scope))
        .order("sort_order", { ascending: true, nullsFirst: false })
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

    const body = parseRequestBody(pushSubscriptionBodySchema, req.body, res);
    if (!body) return;
    const subscription = { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth };

    await upsertPushSubscription({
      userId,
      audience: "main",
      subscription,
      userAgent: req.get("user-agent") ?? undefined,
    });

    return res.json({ ok: true });
  }));

  app.post("/api/push/shared/cleanup-stale", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));
    if (!userId) return res.status(401).json({ message: "Invalid authorization token." });
    const body = parseRequestBody(sharedTokenCleanupSchema, req.body, res);
    if (!body) return;
    const oldToken = normalizeShareToken(body.oldToken);
    if (!oldToken) return res.status(400).json({ message: "Invalid old share token." });

    const supabaseAdmin = assertSupabaseAdmin();
    const scope = await resolveScopeForUserId(userId);
    if (scope.messId) await requireMessOperator(userId);
    let linkQuery = supabaseAdmin.from("share_links").select("token");
    linkQuery = scope.messId
      ? linkQuery.eq("mess_id", scope.messId)
      : linkQuery.eq("user_id", userId).is("mess_id", null);
    const { data: currentLink, error: linkError } = await linkQuery.maybeSingle();
    if (linkError) throw linkError;
    if (!currentLink || normalizeShareToken(currentLink.token) === oldToken) {
      return res.status(409).json({ message: "The share token has not changed." });
    }

    let deleteQuery = supabaseAdmin.from("push_subscriptions").delete()
      .eq("audience", "shared").eq("share_token", oldToken);
    deleteQuery = scope.messId
      ? deleteQuery.eq("mess_id", scope.messId)
      : deleteQuery.eq("user_id", userId).is("mess_id", null);
    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;
    return res.json({ ok: true });
  }));

  app.post("/api/push/status", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));

    if (!userId) {
      return res.status(401).json({ message: "Invalid authorization token." });
    }

    const body = parseRequestBody(endpointStatusBodySchema, req.body, res);
    if (!body) return;
    const endpoint = body.endpoint;
    if (!endpoint) return res.json({ subscribed: false });

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

    const body = parseRequestBody(endpointBodySchema, req.body, res);
    if (!body) return;
    const endpoint = body.endpoint;

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
    const body = parseRequestBody(notificationPreferencesBodySchema, req.body, res);
    if (!body) return;
    const hasReminderTime = body.reminderTime !== undefined;
    const reminderTime = body.reminderTime ?? "";
    const hasGlobal = body.global !== undefined;
    const hasCategories = body.categories !== undefined;
    const categoryInput = body.categories ?? {};
    const supabaseAdmin = assertSupabaseAdmin();
    const { data: current, error: currentError } = await supabaseAdmin.from("profiles").select("reminder_time, notification_preferences").eq("id", userId).single();
    if (currentError) throw currentError;
    const currentPreferences = current?.notification_preferences && typeof current.notification_preferences === "object" ? current.notification_preferences as Record<string, unknown> : {};
    const currentCategories = currentPreferences.categories && typeof currentPreferences.categories === "object" ? currentPreferences.categories as Record<string, unknown> : {};
    const nextPreferences = {
      ...currentPreferences,
      ...(hasGlobal ? { global: body.global } : {}),
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
    const body = parseRequestBody(uuidBodySchema("depositId", "Deposit ID"), req.body, res);
    if (!body) return;
    const depositId = body.depositId;

    const supabaseAdmin = assertSupabaseAdmin();
    const { data: deposit, error } = await supabaseAdmin
      .from("cycle_deposits")
      .select("id, member_id, amount, kind, note")
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
    const body = parseRequestBody(uuidBodySchema("cycleId", "Cycle ID"), req.body, res);
    if (!body) return;
    const cycleId = body.cycleId;

    const supabaseAdmin = assertSupabaseAdmin();
    const { data: cycle, error: cycleError } = await supabaseAdmin
      .from("cycles")
      .select("id, name, status, started_at, closed_at, members_snapshot, settlement_snapshot")
      .eq("id", cycleId)
      .eq("mess_id", messId)
      .eq("status", "pending")
      .maybeSingle();
    if (cycleError) throw cycleError;
    if (!cycle) return res.status(404).json({ message: "Pending cycle not found in your mess." });

    const roster = Array.isArray(cycle.members_snapshot)
      ? cycle.members_snapshot as SnapshotMember[]
      : null;
    const liveRoster = roster ? [] : await fetchAllPages<{
      id: string;
      name: string;
      created_at: string | null;
      deleted_at: string | null;
      sort_order: number | null;
    }>(async (from, to) =>
      await supabaseAdmin
        .from("members")
        .select("id, name, created_at, deleted_at, sort_order")
        .eq("mess_id", messId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .range(from, to),
    );

    const depositsPromise = fetchAllPages<{ member_id: string; amount: number | string }>(async (from, to) =>
      await supabaseAdmin
        .from("cycle_deposits")
        .select("member_id, amount")
        .eq("mess_id", messId)
        .eq("cycle_id", cycle.id)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const expensesPromise = fetchAllPages<{ amount: number | string; type: "meal" | "utility" }>(async (from, to) =>
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

    const members = roster ?? selectCycleMembers(
      liveRoster.map((member) => ({ ...member, deletedAt: member.deleted_at })),
      [
        ...deposits.map((deposit) => deposit.member_id),
        ...mealLogs.map((log) => log.member_id),
      ],
    );
    if (members.length === 0) return res.json({ success: true });

    const math = computeCycleMath({
      members,
      deposits: deposits.map((deposit) => ({ memberId: deposit.member_id, amount: Number(deposit.amount) })),
      expenses: expenses.map((expense) => ({ amount: Number(expense.amount), type: expense.type })),
      mealLogs: mealLogs.map((log) => ({ memberId: log.member_id, count: Number(log.count) })),
      settlementSnapshot: cycle.settlement_snapshot,
      finalized: true,
      cycleStartedAt: cycle.started_at,
      cycleEndedAt: cycle.closed_at,
    });
    const dueMembers = math.members
      .filter((member) => member.balance < 0)
      .map((member) => ({ memberId: member.id, dueAmount: Math.abs(member.balance) }));

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

    const body = parseRequestBody(uuidBodySchema("requestId", "Request ID"), req.body, res);
    if (!body) return;
    const requestId = body.requestId;

    const supabaseAdmin = assertSupabaseAdmin();
    const { data: request, error: requestError } = await supabaseAdmin
      .from("meal_off_requests")
      .select("id, status, member_id, requested_by_profile_id, start_date, end_date, meal_period")
      .eq("id", requestId)
      .eq("mess_id", messId)
      .eq("status", "pending")
      .maybeSingle();
    if (requestError) throw requestError;
    if (!request) return res.status(404).json({ message: "Pending request not found in your mess." });

    if (request.requested_by_profile_id !== userId) {
      return res.status(403).json({ message: "You can only notify for your own requests." });
    }

    const { data: member } = await supabaseAdmin
      .from("members")
      .select("name")
      .eq("id", request.member_id)
      .maybeSingle();

    const memberName = member?.name?.trim() || "A member";

    void sendMealOffRequestSubmittedPush({
      messId,
      actorUserId: userId,
      requestId: request.id,
      memberName,
      startDate: request.start_date,
      endDate: request.end_date,
      mealPeriod: request.meal_period,
    });

    return res.json({ success: true });
  }));

  app.post("/api/push/meal-off/decision", asyncHandler(async (req, res) => {
    const userId = await getAuthenticatedUserId(req.get("authorization"));
    if (!userId) return res.status(401).json({ message: "Invalid authorization token." });
    const messId = await requireMessOperator(userId);
    const body = parseRequestBody(uuidBodySchema("requestId", "Request ID"), req.body, res);
    if (!body) return;
    const requestId = body.requestId;

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
    const token = normalizeShareToken(req.params.token);

    if (!token) {
      return res.status(400).json({ message: "Missing share token." });
    }

    if (!isPushConfigured()) {
      return res.status(503).json({ message: "Push notifications are not configured." });
    }

    const body = parseRequestBody(pushSubscriptionBodySchema, req.body, res);
    if (!body) return;
    const subscription = { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth };

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
    const token = normalizeShareToken(req.params.token);
    const body = parseRequestBody(endpointStatusBodySchema, req.body, res);
    if (!body) return;
    const endpoint = body.endpoint;

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
    const token = normalizeShareToken(req.params.token);
    const body = parseRequestBody(endpointBodySchema, req.body, res);
    if (!body) return;
    const endpoint = body.endpoint;

    if (!token) {
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
    const token = normalizeShareToken(req.params.token);

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
    res.write("retry: 10000\n\n");

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
    invalidateSharedPayload(scope);
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
    const token = normalizeShareToken(req.params.token);

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

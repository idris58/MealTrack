import { supabaseAdmin } from "./supabase-admin";

/**
 * Resolves per-path <head> metadata for the SPA shell. User-facing link
 * previews (B) need real content in raw HTML because social scrapers do not
 * run JavaScript; index hygiene (C) needs everything except the public home
 * page marked noindex. Both are handled here, by server/static.ts.
 *
 * Only public, token-gated pages get custom text. Pages behind auth render
 * the noindex default. Mess names are the only tenant data ever leaked into
 * markup — never member names, balances or tokens-beyond-the-URL.
 */

export interface ResolvedMeta {
  title: string;
  description: string;
  indexable: boolean;
  /** Emit a canonical link pointing at the home page. */
  canonicalHome?: boolean;
  /** Emit WebApplication JSON-LD (home page only). */
  jsonLd?: boolean;
}

export const HOME_TITLE = "MealTrack — Shared Meal & Cost Tracker";
export const HOME_DESCRIPTION =
  "Free shared ledger for messes and shared households — log meals and bazar costs, track deposits, settle monthly balances automatically. Create your mess today.";

const GENERIC_TITLE = "MealTrack";
const SHARED_FALLBACK: ResolvedMeta = {
  title: "Shared Meal Report | MealTrack",
  description:
    "Open a shared MealTrack view with your Meal Code — live meal counts, deposits, expenses and settlement balances for your mess.",
  indexable: false,
};
const SHARED_GATE: ResolvedMeta = {
  title: "Shared Meal Report | MealTrack",
  description:
    "Enter your Meal Code to open a live shared view of your mess — meal counts, deposits, expenses and settlements, updated in real time.",
  indexable: false,
};
const INVITE_FALLBACK: ResolvedMeta = {
  title: "You're invited to a mess | MealTrack",
  description:
    "Accept your MealTrack invitation to join a mess — log shared meals, track deposits and settle monthly balances together.",
  indexable: false,
};

/** 6-char Crockford base32, mirroring normalizeShareToken in routes.ts. */
function normalizeShareToken(value: string): string {
  const token = value.trim().toUpperCase();
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(token) ? token : "";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const metaCache = new Map<string, { meta: ResolvedMeta; expiresAt: number }>();
const META_CACHE_MS = 60_000;

function cached(pathname: string): ResolvedMeta | null {
  const entry = metaCache.get(pathname);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    metaCache.delete(pathname);
    return null;
  }
  return entry.meta;
}

function remember(pathname: string, meta: ResolvedMeta): ResolvedMeta {
  metaCache.set(pathname, { meta, expiresAt: Date.now() + META_CACHE_MS });
  if (metaCache.size > 500) {
    const now = Date.now();
    for (const [key, entry] of Array.from(metaCache)) {
      if (entry.expiresAt <= now) metaCache.delete(key);
    }
  }
  return meta;
}

async function messNameById(messId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("messes")
    .select("name")
    .eq("id", messId)
    .maybeSingle();
  if (error) return null;
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  return name || null;
}

async function resolveSharedMeta(rawToken: string): Promise<ResolvedMeta> {
  const token = normalizeShareToken(rawToken);
  if (!token || !supabaseAdmin) return SHARED_FALLBACK;
  try {
    const { data: link, error } = await supabaseAdmin
      .from("share_links")
      .select("mess_id, is_enabled")
      .eq("token", token)
      .not("mess_id", "is", null)
      .maybeSingle();
    if (error || !link?.is_enabled || !link.mess_id) return SHARED_FALLBACK;
    const messName = await messNameById(link.mess_id);
    if (!messName) return SHARED_FALLBACK;
    return {
      title: `${messName} — Shared Meal Report | MealTrack`,
      description: `Live meal counts, deposits, expenses and settlement balances for ${messName} — a shared mess managed with MealTrack.`,
      indexable: false,
    };
  } catch {
    return SHARED_FALLBACK;
  }
}

async function resolveInviteMeta(rawToken: string): Promise<ResolvedMeta> {
  const token = rawToken.trim().toLowerCase();
  if (!UUID_PATTERN.test(token) || !supabaseAdmin) return INVITE_FALLBACK;
  try {
    const { data: invite, error } = await supabaseAdmin
      .from("member_invites")
      .select("mess_id, claimed_at, revoked_at, expires_at")
      .eq("id", token)
      .maybeSingle();
    if (error || !invite) return INVITE_FALLBACK;
    const isActive =
      !invite.claimed_at &&
      !invite.revoked_at &&
      new Date(invite.expires_at).getTime() > Date.now();
    if (!isActive) return INVITE_FALLBACK;
    const messName = await messNameById(invite.mess_id);
    if (!messName) return INVITE_FALLBACK;
    return {
      title: `You're invited to join ${messName} | MealTrack`,
      description: `${messName} uses MealTrack to manage shared meals, deposits and settlements. Create an account to accept your invitation.`,
      indexable: false,
    };
  } catch {
    return INVITE_FALLBACK;
  }
}

export async function resolvePublicMeta(pathname: string): Promise<ResolvedMeta> {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const hit = cached(path);
  if (hit) return hit;

  let meta: ResolvedMeta;
  if (path === "/") {
    meta = { title: HOME_TITLE, description: HOME_DESCRIPTION, indexable: true, canonicalHome: true, jsonLd: true };
  } else if (path === "/shared") {
    meta = SHARED_GATE;
  } else {
    const sharedMatch = /^\/shared\/([^/]+)$/.exec(path);
    const inviteMatch = /^\/invite\/([^/]+)$/.exec(path);
    if (sharedMatch) {
      meta = await resolveSharedMeta(sharedMatch[1]);
    } else if (inviteMatch) {
      meta = await resolveInviteMeta(inviteMatch[1]);
    } else {
      meta = { title: GENERIC_TITLE, description: HOME_DESCRIPTION, indexable: false };
    }
  }
  return remember(path, meta);
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Renders the HTML that replaces the MT:META marker block in index.html. */
export function buildMetaBlock(meta: ResolvedMeta, origin: string, pathname: string): string {
  const title = escapeHtmlAttr(meta.title);
  const description = escapeHtmlAttr(meta.description);
  const robots = meta.indexable ? "index, follow" : "noindex, nofollow";
  const ogImage = `${origin}/opengraph.jpg`;
  const ogUrl = `${origin}${pathname === "/" ? "/" : pathname}`;

  const lines = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="MealTrack" />`,
    `<meta property="og:url" content="${escapeHtmlAttr(ogUrl)}" />`,
    `<meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />`,
    `<meta property="og:image:width" content="1280" />`,
    `<meta property="og:image:height" content="720" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeHtmlAttr(ogImage)}" />`,
  ];

  if (meta.canonicalHome) {
    lines.push(`<link rel="canonical" href="${escapeHtmlAttr(`${origin}/`)}" />`);
  }

  if (meta.jsonLd) {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "MealTrack",
      url: `${origin}/`,
      description: HOME_DESCRIPTION,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any",
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);
  }

  return lines.join("\n    ");
}

import { createPublicKey, constants, verify as verifySignature } from "node:crypto";

type SupabaseJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

type SupabaseClaims = {
  sub?: unknown;
  iss?: unknown;
  aud?: unknown;
  role?: unknown;
  exp?: unknown;
  nbf?: unknown;
};

type JwksCache = { fetchedAt: number; keys: SupabaseJwk[] };

const JWKS_CACHE_MS = 5 * 60 * 1000;
const UNKNOWN_KEY_REFRESH_COOLDOWN_MS = 30 * 1000;
let jwksCache: JwksCache | null = null;
let jwksRequest: Promise<SupabaseJwk[]> | null = null;

function supabaseIssuer() {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured.");
  return new URL("/auth/v1", url).toString().replace(/\/$/, "");
}

async function loadJwks(forceRefresh = false): Promise<SupabaseJwk[]> {
  const now = Date.now();
  if (!forceRefresh && jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_MS) {
    return jwksCache.keys;
  }
  if (forceRefresh && jwksCache && now - jwksCache.fetchedAt < UNKNOWN_KEY_REFRESH_COOLDOWN_MS) {
    return jwksCache.keys;
  }
  if (jwksRequest) return jwksRequest;

  const request = (async () => {
    const url = new URL(".well-known/jwks.json", `${supabaseIssuer()}/`).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Unable to load Supabase signing keys (${response.status}).`);
    const body = await response.json() as { keys?: SupabaseJwk[] };
    if (!Array.isArray(body.keys)) throw new Error("Supabase signing keys response is invalid.");
    jwksCache = { fetchedAt: Date.now(), keys: body.keys };
    return body.keys;
  })();
  jwksRequest = request;
  try {
    return await request;
  } finally {
    if (jwksRequest === request) jwksRequest = null;
  }
}

function decodeJsonPart<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Returns a verified user id, null for an invalid token, or undefined for legacy HS256 tokens. */
export async function verifySupabaseAccessToken(token: string): Promise<string | null | undefined> {
  if (token.length > 8192) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = decodeJsonPart<{ alg?: unknown; kid?: unknown }>(parts[0]);
  const claims = decodeJsonPart<SupabaseClaims>(parts[1]);
  if (!header || !claims || typeof header.alg !== "string") return null;

  // Projects still signing with the legacy shared secret have no public JWKS key.
  // Keep their existing server-side verification path until they rotate signing keys.
  if (header.alg === "HS256") return undefined;
  if (!(["RS256", "ES256", "PS256", "EdDSA"] as const).includes(header.alg as "RS256" | "ES256" | "PS256" | "EdDSA")) return null;
  if (typeof header.kid !== "string" || !header.kid || header.kid.length > 256) return null;

  const issuer = supabaseIssuer();
  if (claims.iss !== issuer || typeof claims.sub !== "string" || !claims.sub || claims.role !== "authenticated") return null;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes("authenticated")) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null;
  if (typeof claims.nbf === "number" && claims.nbf > nowSeconds + 30) return null;

  let keys = await loadJwks();
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    keys = await loadJwks(true);
    jwk = keys.find((key) => key.kid === header.kid);
  }
  if (!jwk || (jwk.use && jwk.use !== "sig") || (jwk.alg && jwk.alg !== header.alg)) return null;

  try {
    const key = createPublicKey({ key: jwk as unknown as Record<string, unknown>, format: "jwk" });
    const signedData = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], "base64url");
    let valid = false;
    if (header.alg === "RS256") {
      valid = verifySignature("RSA-SHA256", signedData, key, signature);
    } else if (header.alg === "PS256") {
      valid = verifySignature("sha256", signedData, {
        key,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      }, signature);
    } else if (header.alg === "ES256") {
      valid = verifySignature("sha256", signedData, { key, dsaEncoding: "ieee-p1363" }, signature);
    } else {
      valid = verifySignature(null, signedData, key, signature);
    }
    return valid ? claims.sub : null;
  } catch {
    return null;
  }
}

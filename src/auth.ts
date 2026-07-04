/**
 * وحدة المصادقة الآمنة لرياض المتقين.
 *
 * - تشفير كلمات السر: PBKDF2-HMAC-SHA256 عبر Web Crypto (لا تخزين نصّي إطلاقاً).
 * - الجلسات: رمزٌ عشوائيٌّ يُخزَّن مُجزّأً (SHA-256) في قاعدة البيانات، وكوكي آمن.
 */

const PBKDF2_ITERATIONS = 100_000;
const SESSION_COOKIE = "rsid";
const SESSION_TTL_DAYS = 30;
const enc = new TextEncoder();

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: "student" | "teacher" | "admin" | "manager";
  /** يجب على المستخدم تعيين كلمة مرور جديدة قبل استخدام المنصّة. */
  mustChangePassword?: boolean;
}

/* ===== ترميز ===== */
function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ===== كلمات السر ===== */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toB64(salt)}:${toB64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = fromB64(parts[2]);
  const expected = fromB64(parts[3]);
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ===== الرموز والجلسات ===== */
function generateToken(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return toHex(new Uint8Array(digest));
}

/** ينشئ جلسة، يخزّن تجزئة الرمز، ويُعيد ترويسة Set-Cookie. */
export async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await db
    .prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
    .bind(userId, tokenHash, expires.toISOString())
    .run();
  return cookie(SESSION_COOKIE, token, SESSION_TTL_DAYS * 86_400);
}

/** يُعيد المستخدم الحالي من كوكي الجلسة، أو null. */
export async function getSessionUser(request: Request, db: D1Database): Promise<AuthUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.must_change_password
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > datetime('now')
          AND u.status = 'active'`,
    )
    .bind(tokenHash)
    .first<{ id: number; name: string; email: string; role: AuthUser["role"]; must_change_password: number }>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

/** يحذف الجلسة الحالية ويُعيد كوكي إزالة. */
export async function destroySession(request: Request, db: D1Database): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  return cookie(SESSION_COOKIE, "", 0);
}

/* ===== كوكيز ===== */
function cookie(name: string, value: string, maxAgeSec: number): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ].join("; ");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/* ===== تحقّق من المدخلات ===== */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

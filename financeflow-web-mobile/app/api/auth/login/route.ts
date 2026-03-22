import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE_SECONDS,
  createAuthSessionToken,
} from "@/lib/auth-session";
import {
  isSingleUserAuthConfigured,
  validateSingleUserCredentials,
} from "@/lib/single-user-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 10;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

function canAttempt(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry) return true;
  if (entry.resetAt <= now) {
    attempts.delete(ip);
    return true;
  }
  return entry.count < ATTEMPT_LIMIT;
}

function registerFailedAttempt(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  entry.count += 1;
  attempts.set(ip, entry);
}

function clearAttempts(ip: string): void {
  attempts.delete(ip);
}

export async function POST(req: NextRequest) {
  if (!isSingleUserAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Autenticacao nao configurada. Defina AUTH_LOGIN_EMAIL, AUTH_LOGIN_PASSWORD e AUTH_SESSION_SECRET.",
      },
      { status: 500 },
    );
  }

  const ip = clientIp(req);
  if (!canAttempt(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "");
  const password = String(body?.password ?? "");
  if (!email || !password) {
    registerFailedAttempt(ip);
    return NextResponse.json({ error: "Email e senha sao obrigatorios." }, { status: 400 });
  }

  if (!validateSingleUserCredentials(email, password)) {
    registerFailedAttempt(ip);
    return NextResponse.json({ error: "Credenciais invalidas." }, { status: 401 });
  }

  clearAttempts(ip);
  const token = await createAuthSessionToken(email.trim().toLowerCase());
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

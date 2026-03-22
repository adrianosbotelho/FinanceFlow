import "server-only";
import { timingSafeEqual } from "node:crypto";

export function isSingleUserAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_LOGIN_EMAIL &&
      process.env.AUTH_LOGIN_PASSWORD &&
      process.env.AUTH_SESSION_SECRET,
  );
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a ?? "");
  const bBuf = Buffer.from(b ?? "");
  const len = Math.max(aBuf.length, bBuf.length, 1);
  const aPadded = Buffer.alloc(len);
  const bPadded = Buffer.alloc(len);
  aBuf.copy(aPadded);
  bBuf.copy(bPadded);
  const same = timingSafeEqual(aPadded, bPadded);
  return same && aBuf.length === bBuf.length;
}

export function validateSingleUserCredentials(email: string, password: string): boolean {
  const configuredEmail = process.env.AUTH_LOGIN_EMAIL ?? "";
  const configuredPassword = process.env.AUTH_LOGIN_PASSWORD ?? "";
  return safeEqual(email.trim().toLowerCase(), configuredEmail.trim().toLowerCase()) && safeEqual(password, configuredPassword);
}

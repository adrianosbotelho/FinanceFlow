export const AUTH_COOKIE_NAME = "ff_session";
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export interface AuthSession {
  iat: number;
  exp: number;
  email: string;
  type: "single-user";
}

function authSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing AUTH_SESSION_SECRET.");
  }
  return secret;
}

function toBase64Url(input: Uint8Array): string {
  let base64: string;
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(input).toString("base64");
  } else {
    let binary = "";
    input.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(padded, "base64"));
  }
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

const encoder = new TextEncoder();
let cachedKey: Promise<CryptoKey> | null = null;

async function hmacKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = crypto.subtle.importKey(
      "raw",
      encoder.encode(authSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return cachedKey;
}

async function sign(data: string): Promise<string> {
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBase64Url(new Uint8Array(signature));
}

async function verify(data: string, signature: string): Promise<boolean> {
  const key = await hmacKey();
  return crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature) as BufferSource,
    encoder.encode(data) as BufferSource,
  );
}

export async function createAuthSessionToken(email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthSession = {
    iat: now,
    exp: now + AUTH_SESSION_MAX_AGE_SECONDS,
    email,
    type: "single-user",
  };
  const payloadEncoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export async function verifyAuthSessionToken(token: string | undefined | null): Promise<AuthSession | null> {
  if (!token) return null;
  try {
    const [payloadEncoded, signature] = token.split(".");
    if (!payloadEncoded || !signature) return null;
    const valid = await verify(payloadEncoded, signature);
    if (!valid) return null;
    const payloadText = new TextDecoder().decode(fromBase64Url(payloadEncoded));
    const payload = JSON.parse(payloadText) as Partial<AuthSession>;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.email || payload.type !== "single-user") return null;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    if (typeof payload.iat !== "number") return null;
    return payload as AuthSession;
  } catch {
    return null;
  }
}

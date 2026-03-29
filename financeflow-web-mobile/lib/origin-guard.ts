import "server-only";
import { NextRequest, NextResponse } from "next/server";

function parseOriginFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function parseAllowedOriginsFromEnv(): Set<string> {
  const out = new Set<string>();
  const raw = process.env.SECURITY_ALLOWED_ORIGINS ?? "";
  for (const item of raw.split(",")) {
    const normalized = parseOriginFromUrl(item.trim());
    if (normalized) out.add(normalized);
  }
  return out;
}

function expectedOrigins(req: NextRequest): Set<string> {
  const allowed = parseAllowedOriginsFromEnv();
  allowed.add(req.nextUrl.origin);

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  if (host && proto) {
    allowed.add(`${proto}://${host}`);
  }

  const baseOrigin = parseOriginFromUrl(process.env.NEXT_PUBLIC_BASE_URL);
  if (baseOrigin) allowed.add(baseOrigin);

  return allowed;
}

export function verifyTrustedOrigin(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const allowed = expectedOrigins(req);
  const origin = parseOriginFromUrl(req.headers.get("origin"));

  if (origin) {
    if (allowed.has(origin)) return { ok: true };
    return { ok: false, reason: `Origin não permitida: ${origin}` };
  }

  const referer = parseOriginFromUrl(req.headers.get("referer"));
  if (referer && allowed.has(referer)) return { ok: true };

  const allowMissingInProd = process.env.SECURITY_ALLOW_MISSING_ORIGIN === "true";
  if (process.env.NODE_ENV !== "production" || allowMissingInProd) {
    return { ok: true };
  }

  return { ok: false, reason: "Origin/Referer ausentes em operação mutável." };
}

export function rejectUntrustedOrigin(req: NextRequest): NextResponse | null {
  const verdict = verifyTrustedOrigin(req);
  if (verdict.ok) return null;
  return NextResponse.json(
    {
      error:
        "Operação bloqueada por validação de origem (CSRF). Recarregue a página e tente novamente.",
      detail: verdict.reason,
    },
    { status: 403 },
  );
}


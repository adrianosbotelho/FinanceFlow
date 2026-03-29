import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AUTH_COOKIE_NAME, verifyAuthSessionToken } from "@/lib/auth-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await verifyAuthSessionToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
  const authenticated = Boolean(session);

  if (!authenticated) {
    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        scope: "public",
      },
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const hasUrl = Boolean(url);
  const hasAnon = Boolean(anon);
  const hasService = Boolean(service);
  const key = service || anon;

  let dbReachable = false;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  if (hasUrl && key) {
    try {
      const started = Date.now();
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await supabase.from("investments").select("id").limit(1);
      dbLatencyMs = Date.now() - started;
      if (error) {
        dbError = error.message;
      } else {
        dbReachable = true;
      }
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Erro desconhecido no ping de banco.";
    }
  }

  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      scope: "private",
      checks: {
        supabaseUrl: hasUrl,
        supabaseAnon: hasAnon,
        supabaseServiceRole: hasService,
        dbReachable,
      },
      metrics: {
        dbLatencyMs,
      },
      errors: {
        db: dbError,
      },
    },
    {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    },
  );
}

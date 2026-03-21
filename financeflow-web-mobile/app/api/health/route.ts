import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      checks: {
        supabaseUrl: hasUrl,
        supabaseAnon: hasAnon,
        supabaseServiceRole: hasService,
      },
    },
    {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    },
  );
}

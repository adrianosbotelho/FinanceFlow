import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthSessionToken } from "@/lib/auth-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await verifyAuthSessionToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    email: session.email,
    exp: session.exp ?? null,
  });
}

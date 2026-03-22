import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthSessionToken } from "@/lib/auth-session";

const PUBLIC_PAGE_PREFIXES = ["/login", "/offline"];
const PUBLIC_API_PREFIXES = ["/api/auth"];
const ALWAYS_PUBLIC = ["/api/health"];

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
}

function isPublicPath(pathname: string): boolean {
  if (ALWAYS_PUBLIC.includes(pathname)) return true;
  if (PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    if (pathname.startsWith("/login")) {
      const session = await verifyAuthSessionToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
      if (session) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
    return NextResponse.next();
  }

  const session = await verifyAuthSessionToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

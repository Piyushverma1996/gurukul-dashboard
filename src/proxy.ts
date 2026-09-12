import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/cron", "/robots.txt", "/manifest.webmanifest", "/icons", "/logo.png", "/favicon.ico"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Optimistic check only (cookie presence). Pages re-validate the session with requirePageUser(). */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname) || getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

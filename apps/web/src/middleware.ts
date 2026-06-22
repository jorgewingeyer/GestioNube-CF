import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESSION } from "./constants/cookies";

const AUTH_ROUTES = ["/login", "/register", "/reset-password", "/verify-email"];
const PUBLIC_ROUTES = ["/", "/about", "/contact", "/privacy", "/terms", "/api"];

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAuthRoute = AUTH_ROUTES.includes(pathname);
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  // 1. If it's a public route -> continue
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // 2. Get the session
  const session = request.cookies.get(COOKIE_SESSION)?.value;

  // 3. If has session and is auth route -> redirect to dashboard
  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!session && !isAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Fallback (should not reach here)
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|avif|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

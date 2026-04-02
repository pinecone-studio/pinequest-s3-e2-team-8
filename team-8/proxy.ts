import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const bypassExactPaths = new Set([
  "/favicon.ico",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
  "/sw.js",
]);

const bypassPrefixes = [
  "/_next/",
  "/icon",
  "/apple-icon",
  "/opengraph-image",
  "/twitter-image",
];

function shouldBypassAuthProxy(pathname: string) {
  if (bypassExactPaths.has(pathname)) {
    return true;
  }

  if (bypassPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }

  // Public assets under /public are requested as dotted paths. Let them bypass auth.
  return /\.[^/]+$/.test(pathname);
}

export async function proxy(request: NextRequest) {
  if (shouldBypassAuthProxy(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|robots\\.txt|sitemap\\.xml|sw\\.js|icon|apple-icon|opengraph-image|twitter-image|.*\\.[^/]+$).*)",
  ],
};

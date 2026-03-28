import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/", "/login", "/register"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const pathname = request.nextUrl.pathname;
  const isPublicPath = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const isApiPath = pathname.startsWith("/api");
  const isAuthPath = pathname === "/login" || pathname === "/register";

  // Allow API routes through
  if (isApiPath) return supabaseResponse;

  // Not logged in → redirect to login (except public paths)
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Public auth routes need a stronger check than getSession().
  // After reseeding auth users, stale cookies can still produce a local session
  // object and cause /login -> / -> /login redirect loops.
  if (user && isAuthPath) {
    const {
      data: { user: verifiedUser },
    } = await supabase.auth.getUser();

    if (!verifiedUser) {
      await supabase.auth.signOut();
      return supabaseResponse;
    }

    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Logged-in users are allowed through here.
  // Role-specific authorization is enforced in route layouts/pages, which
  // avoids repeated profiles lookups in middleware for every navigation.
  if (user && !isPublicPath) {
    return supabaseResponse;
  }

  return supabaseResponse;
}

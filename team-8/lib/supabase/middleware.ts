import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/", "/login", "/register"];
const rolePaths: Record<string, string[]> = {
  student: ["/student"],
  teacher: ["/educator"],
  admin: ["/admin", "/educator"],
};

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
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicPath = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const isApiPath = pathname.startsWith("/api");

  // Allow API routes through
  if (isApiPath) return supabaseResponse;

  // Not logged in → redirect to login (except public paths)
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in user visiting login/register → redirect to their dashboard
  if (user && (pathname === "/login" || pathname === "/register")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role || "student";
    const url = request.nextUrl.clone();
    url.pathname =
      role === "teacher"
        ? "/educator"
        : role === "admin"
          ? "/admin"
          : "/student";
    return NextResponse.redirect(url);
  }

  // Logged in user → check role access
  if (user && !isPublicPath) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role || "student";
    const allowedPaths = rolePaths[role] || ["/student"];

    const hasAccess = allowedPaths.some((p) => pathname.startsWith(p));

    if (!hasAccess) {
      const url = request.nextUrl.clone();
      url.pathname = allowedPaths[0];
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

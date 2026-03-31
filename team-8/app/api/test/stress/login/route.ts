import { NextResponse } from "next/server";
import {
  createStressAuthClient,
  getStressRouteAuthorizationError,
} from "@/lib/stress-test";

export async function POST(request: Request) {
  const authorizationError = getStressRouteAuthorizationError(request);
  if (authorizationError) {
    return NextResponse.json(
      { ok: false, error: authorizationError },
      { status: authorizationError === "Unauthorized" ? 401 : 403 }
    );
  }

  let body: { email?: string; password?: string };

  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const email = body.email?.trim();
  const password = body.password?.trim();

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "email and password are required." },
      { status: 400 }
    );
  }

  try {
    const supabase = createStressAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Login failed." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      userId: data.user.id,
      email: data.user.email ?? email,
      accessToken: data.session.access_token,
      expiresAt: data.session.expires_at ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 }
    );
  }
}

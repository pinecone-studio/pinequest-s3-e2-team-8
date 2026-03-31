import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAuthorizedCronRequest } from "@/lib/notification/cron";

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase public client is not configured.");
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
}

export function getStressRouteAuthorizationError(request: Request) {
  const explicitlyEnabled =
    process.env.ENABLE_LOCAL_STRESS_ROUTES?.trim() === "true";

  if (process.env.NODE_ENV === "production" && !explicitlyEnabled) {
    return "Stress test routes are disabled in production.";
  }

  if (!isAuthorizedCronRequest(request)) {
    return "Unauthorized";
  }

  return null;
}

export function createStressAuthClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicConfig();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createStressUserClient(accessToken: string) {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicConfig();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function decodeJwtPayload(accessToken: string) {
  const segments = accessToken.split(".");
  if (segments.length < 2) {
    return null;
  }

  try {
    const base64 = segments[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(segments[1].length / 4) * 4, "=");
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    const payload = JSON.parse(decoded) as {
      sub?: unknown;
      email?: unknown;
    };

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return null;
    }

    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
    };
  } catch {
    return null;
  }
}

export async function getStressUserContext(request: Request): Promise<{
  supabase: SupabaseClient;
  accessToken: string;
  user: { id: string; email: string | null };
}> {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    throw new Error("Missing bearer token.");
  }

  const decodedUser = decodeJwtPayload(accessToken);
  if (decodedUser) {
    return {
      supabase: createStressUserClient(accessToken),
      accessToken,
      user: decodedUser,
    };
  }

  const authClient = createStressAuthClient();
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(accessToken);

  if (error || !user) {
    throw new Error(error?.message ?? "Invalid bearer token.");
  }

  return {
    supabase: createStressUserClient(accessToken),
    accessToken,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
  };
}

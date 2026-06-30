import { redirect } from "react-router";

import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import {
  PUBLIC_ACADEMY_ONBOARDING_PATH,
  PUBLIC_REGISTRATION_CONFIRMATION_ERROR_PATH,
} from "@/lib/auth/access-paths.shared";
import {
  createSupabaseSessionClearHeaders,
  withSupabaseSsrHeaders,
} from "@/lib/auth/supabase-auth-ssr.server";

import type { Route } from "./+types/registro.confirmar";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!tokenHash || type !== "signup") {
    throw redirect(PUBLIC_REGISTRATION_CONFIRMATION_ERROR_PATH, {
      headers: createSupabaseSessionClearHeaders(request),
    });
  }

  let result: Awaited<ReturnType<typeof accessAuthProvider.confirmEmailOtp>>;

  try {
    result = await accessAuthProvider.confirmEmailOtp({
      request,
      tokenHash,
      type,
    });
  } catch {
    throw redirect(PUBLIC_REGISTRATION_CONFIRMATION_ERROR_PATH, {
      headers: createSupabaseSessionClearHeaders(request),
    });
  }

  throw redirect(
    PUBLIC_ACADEMY_ONBOARDING_PATH,
    withSupabaseSsrHeaders({ headers: result.headers }),
  );
}

import { redirect } from "react-router";

import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { SignUpConfirmationRefusedError } from "@/lib/auth/access-auth-provider.shared.server";
import {
  PUBLIC_ONBOARDING_PATH,
  PUBLIC_REGISTRATION_CONFIRMATION_ERROR_PATH,
} from "@/lib/auth/access-paths.shared";
import { createLegacySessionCookieClearHeaders } from "@/lib/auth/legacy-session-cookies.server";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";
import { describeServerError } from "@/lib/shared/unexpected-error-log.server";

import type { Route } from "./+types/registro_.confirmar";

export async function loader({ request }: Route.LoaderArgs) {
  const url = readRequestedUrl(request);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!tokenHash || type !== "signup") {
    throw redirect(PUBLIC_REGISTRATION_CONFIRMATION_ERROR_PATH, {
      headers: createLegacySessionCookieClearHeaders(request),
    });
  }

  let result: Awaited<ReturnType<typeof accessAuthProvider.confirmEmailOtp>>;

  try {
    result = await accessAuthProvider.confirmEmailOtp({
      request,
      tokenHash,
      type,
    });
  } catch (thrown) {
    if (!(thrown instanceof SignUpConfirmationRefusedError)) {
      console.error("[auth:provider:error]", {
        operation: "confirmEmailOtp",
        error: describeServerError(thrown),
      });
    }

    throw redirect(PUBLIC_REGISTRATION_CONFIRMATION_ERROR_PATH, {
      headers: createLegacySessionCookieClearHeaders(request),
    });
  }

  throw redirect(PUBLIC_ONBOARDING_PATH, { headers: result.headers });
}

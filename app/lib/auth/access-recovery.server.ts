import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { RecoveryLinkRefusedError } from "@/lib/auth/access-auth-provider.shared.server";
import { normalizeEmail } from "@/lib/shared/email-normalization";
import { describeServerError } from "@/lib/shared/unexpected-error-log.server";

const RECOVERY_REQUEST_MESSAGE =
  "Si el correo corresponde a un usuario existente, enviamos un enlace para recuperar el acceso.";
const INVALID_RECOVERY_MESSAGE =
  "El enlace no es válido o expiró. Pedí uno nuevo para recuperar el acceso.";

type RequestPasswordReset = typeof accessAuthProvider.requestPasswordReset;
type IsRecoveryEligible = (email: string) => Promise<boolean>;

export async function requestAccessRecoveryEmail(input: {
  email: string;
  requestUrl: string;
  request: Request;
  requestPasswordReset?: RequestPasswordReset;
  isRecoveryEligible?: IsRecoveryEligible;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const isRecoveryEligible = await (
    input.isRecoveryEligible ?? isEligibleAcademyRecoveryEmail
  )(normalizedEmail);

  if (!isRecoveryEligible) {
    return {
      headers: new Headers(),
      message: RECOVERY_REQUEST_MESSAGE,
    };
  }

  const result = await (
    input.requestPasswordReset ?? accessAuthProvider.requestPasswordReset
  )({
    email: normalizedEmail,
    redirectTo: new URL("/cambiar-contrasena", input.requestUrl).toString(),
    request: input.request,
  });

  return {
    headers: result.headers,
    message: RECOVERY_REQUEST_MESSAGE,
    ...(result.debugRecoveryCode
      ? { debugRecoveryCode: result.debugRecoveryCode }
      : {}),
  };
}

export async function exchangeAccessRecoveryCode(input: {
  code: string;
  request: Request;
  redirectTo: string;
}) {
  try {
    const result = await accessAuthProvider.exchangePasswordRecoveryCode(input);

    return {
      ok: true as const,
      headers: result.headers,
      redirectTo: result.redirectTo,
    };
  } catch (thrown) {
    return refuseRecoveryLink("exchangePasswordRecoveryCode", thrown);
  }
}

export async function verifyAccessRecoveryTokenHash(input: {
  request: Request;
  redirectTo: string;
  tokenHash: string;
}) {
  try {
    const result = await accessAuthProvider.verifyPasswordRecoveryOtp(input);

    return {
      ok: true as const,
      headers: result.headers,
      redirectTo: result.redirectTo,
    };
  } catch (thrown) {
    return refuseRecoveryLink("verifyPasswordRecoveryOtp", thrown);
  }
}

export async function updateAccessRecoveryPassword(input: {
  newPassword: string;
  request: Request;
}) {
  try {
    const updateResult = await accessAuthProvider.updatePasswordForRecovery({
      newPassword: input.newPassword,
      request: input.request,
    });
    const signOutResult = await accessAuthProvider.signOutCurrentSession(
      input.request,
    );

    return {
      ok: true as const,
      headers: mergeHeaders(updateResult.headers, signOutResult.headers),
    };
  } catch (thrown) {
    return refuseRecoveryLink("updatePasswordForRecovery", thrown);
  }
}

// An unknown, expired or used link is the academy's to fix by asking for a new
// one. Anything else is the provider or the database failing, which reads the
// same to the academy but is logged, or it would leave no trace at all.
function refuseRecoveryLink(
  operation:
    | "exchangePasswordRecoveryCode"
    | "updatePasswordForRecovery"
    | "verifyPasswordRecoveryOtp",
  thrown: unknown,
) {
  if (!(thrown instanceof RecoveryLinkRefusedError)) {
    console.error("[auth:provider:error]", {
      operation,
      error: describeServerError(thrown),
    });
  }

  return {
    ok: false as const,
    error: INVALID_RECOVERY_MESSAGE,
  };
}

async function isEligibleAcademyRecoveryEmail(email: string) {
  const eligibleUser = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(academies, eq(academies.userId, user.id))
    .where(
      and(
        eq(user.email, email),
        eq(user.role, "academy"),
        eq(user.emailVerified, true),
        eq(user.suspended, false),
      ),
    )
    .then(([record]) => record ?? null);

  return eligibleUser !== null;
}

function mergeHeaders(...headerSets: Headers[]) {
  const mergedHeaders = new Headers();

  for (const headerSet of headerSets) {
    for (const [name, value] of headerSet) {
      mergedHeaders.append(name, value);
    }
  }

  return mergedHeaders;
}

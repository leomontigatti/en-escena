import { and, eq, ne } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@better-auth/utils/password";
import { redirect } from "react-router";

import { db } from "@/db";
import { account, session, user } from "@/db/schema";
import { MANDATORY_PASSWORD_CHANGE_PATH } from "@/lib/auth/access-paths.shared";
import { auth } from "@/lib/auth/auth.server";
import { getLandingPathForUserId } from "@/lib/auth/internal-navigation.server";
import {
  requireSignedInUser,
  type AppUser,
} from "@/lib/auth/internal-access.server";
import { isInternalUserRole } from "@/lib/auth/internal-user-roles";

export async function requireMandatoryPasswordChangeUser(request: Request) {
  const appUser = await requireSignedInUser(request, {
    allowMandatoryPasswordChange: true,
  });

  if (!isInternalUserRole(appUser.role) || !appUser.requiresPasswordChange) {
    throw redirect(await getLandingPathForUserId(appUser.id));
  }

  return appUser;
}

export async function completeMandatoryPasswordChange(input: {
  request: Request;
  currentPassword: string;
  newPassword: string;
}) {
  const appUser = await requireMandatoryPasswordChangeUser(input.request);

  const credentialAccount = await db.query.account.findFirst({
    columns: { password: true },
    where: and(
      eq(account.userId, appUser.id),
      eq(account.providerId, "credential"),
    ),
  });

  if (!credentialAccount?.password) {
    return {
      ok: false as const,
      error: "No pudimos validar tu contraseña actual.",
    };
  }

  const matchesCurrentPassword = await verifyPassword(
    credentialAccount.password,
    input.currentPassword,
  );

  if (!matchesCurrentPassword) {
    return {
      ok: false as const,
      error: "La contraseña actual no es correcta.",
    };
  }

  const newPasswordHash = await hashPassword(input.newPassword);
  const currentSession = await getRequiredSession(appUser, input.request);

  await db.transaction(async (tx) => {
    await tx
      .update(account)
      .set({ password: newPasswordHash })
      .where(
        and(
          eq(account.userId, appUser.id),
          eq(account.providerId, "credential"),
        ),
      );

    await tx
      .update(user)
      .set({ requiresPasswordChange: false })
      .where(eq(user.id, appUser.id));

    await tx
      .delete(session)
      .where(
        and(eq(session.userId, appUser.id), ne(session.id, currentSession.id)),
      );
  });

  return {
    ok: true as const,
    redirectTo: await getLandingPathForUserId(appUser.id),
  };
}

async function getRequiredSession(appUser: AppUser, request: Request) {
  const activeSession = await auth.api.getSession({
    headers: request.headers,
  });

  if (!activeSession?.session.id || activeSession.user.id !== appUser.id) {
    throw redirect(MANDATORY_PASSWORD_CHANGE_PATH);
  }

  return { id: activeSession.session.id };
}

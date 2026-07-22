import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { upsertBetterAuthCredentialPassword } from "@/lib/auth/access-auth-provider.betterauth.server";
import { MANDATORY_PASSWORD_CHANGE_PATH } from "@/lib/auth/access-paths.shared";
import {
  revokeOtherAccessSessions,
  verifyInternalCredentialPassword,
} from "@/lib/auth/internal-user-auth.server";
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
  const currentSession = await getRequiredSession(appUser, input.request);
  const matchesCurrentPassword = await verifyInternalCredentialPassword({
    email: appUser.email,
    password: input.currentPassword,
  });

  if (!matchesCurrentPassword) {
    return {
      ok: false as const,
      error: "La contraseña actual no es correcta.",
    };
  }

  // Cambio de contraseña propio (no es una operación de admin): actualiza la
  // credencial directamente con el hasher de Better Auth, sin pasar por el admin
  // plugin (que exige una sesión de admin).
  await upsertBetterAuthCredentialPassword({
    password: input.newPassword,
    userId: appUser.id,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ requiresPasswordChange: false })
      .where(eq(user.id, appUser.id));
  });

  await revokeOtherAccessSessions({
    currentSessionId: currentSession.id,
    userId: appUser.id,
  });

  return {
    ok: true as const,
    redirectTo: await getLandingPathForUserId(appUser.id),
  };
}

async function getRequiredSession(appUser: AppUser, request: Request) {
  const activeSession = await accessAuthProvider.getAccessSession(request);

  if (!activeSession?.session.id || activeSession.user.id !== appUser.id) {
    throw redirect(MANDATORY_PASSWORD_CHANGE_PATH);
  }

  return { id: activeSession.session.id };
}

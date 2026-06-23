import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, accessSession, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { redirectToLoginForRequest } from "@/lib/auth/access-redirects.server";
import {
  MANDATORY_PASSWORD_CHANGE_PATH,
  PUBLIC_ACADEMY_ONBOARDING_PATH,
} from "@/lib/auth/access-paths.shared";
import {
  INTERNAL_USER_ROLES,
  isInternalUserRole,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  role: "academy" | InternalUserRole;
  requiresPasswordChange: boolean;
  sessionInvalidBefore: Date | null;
};

export type SignedInAccessState =
  | {
      kind: "app-user";
      user: AppUser;
    }
  | {
      kind: "academy-onboarding";
      user: {
        email: string;
        id: string;
      };
    };

const DEFAULT_FORBIDDEN_MESSAGE = "No tenés permiso para acceder a esta vista.";

export async function requireSignedInAccessState(
  request: Request,
  options?: { allowMandatoryPasswordChange?: boolean },
): Promise<SignedInAccessState> {
  const session = await accessAuthProvider.getAccessSession(request);

  if (!session) {
    redirectToLoginForRequest(request);
  }

  const appUser = await db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      name: true,
      role: true,
      requiresPasswordChange: true,
      sessionInvalidBefore: true,
      suspended: true,
    },
    where: eq(user.id, session.user.id),
  });

  if (appUser) {
    if (appUser.suspended) {
      await revokeAppUserSessionsAndRedirect(request, appUser.id);
    }

    if (
      appUser.sessionInvalidBefore &&
      session.session.issuedAt &&
      session.session.issuedAt < appUser.sessionInvalidBefore
    ) {
      await revokeAppUserSessionsAndRedirect(request, appUser.id);
    }

    if (
      !options?.allowMandatoryPasswordChange &&
      appUser.role !== "academy" &&
      appUser.requiresPasswordChange
    ) {
      throw redirect(MANDATORY_PASSWORD_CHANGE_PATH);
    }

    return {
      kind: "app-user",
      user: appUser satisfies AppUser,
    };
  }

  const verifiedIdentity =
    await accessAuthProvider.getVerifiedAccessIdentity(request);

  if (
    verifiedIdentity &&
    verifiedIdentity.user.id === session.user.id &&
    verifiedIdentity.user.email === session.user.email
  ) {
    return {
      kind: "academy-onboarding",
      user: verifiedIdentity.user,
    };
  }

  redirectToLoginForRequest(request);
}

export async function requireSignedInUser(
  request: Request,
  options?: { allowMandatoryPasswordChange?: boolean },
) {
  const accessState = await requireSignedInAccessState(request, options);

  if (accessState.kind === "academy-onboarding") {
    throw redirect(PUBLIC_ACADEMY_ONBOARDING_PATH);
  }

  return accessState.user;
}

export async function requireAcademyUser(request: Request) {
  const appUser = await requireSignedInUser(request);

  if (appUser.role !== "academy") {
    throwForbidden("Los usuarios internos no pueden acceder al portal.");
  }

  const academy = await db.query.academies.findFirst({
    columns: {
      id: true,
      userId: true,
      name: true,
      contactName: true,
      phone: true,
    },
    where: eq(academies.userId, appUser.id),
  });

  if (!academy) {
    throw redirect(PUBLIC_ACADEMY_ONBOARDING_PATH);
  }

  return { user: appUser, academy };
}

export async function requireInternalUser(
  request: Request,
  allowedRoles: readonly InternalUserRole[] = INTERNAL_USER_ROLES,
) {
  const appUser = await requireSignedInUser(request);

  if (
    !isInternalUserRole(appUser.role) ||
    !allowedRoles.includes(appUser.role)
  ) {
    throwForbidden();
  }

  return appUser;
}

export async function requireAdminUser(request: Request) {
  return await requireInternalUser(request, ["admin"]);
}

function throwForbidden(message = DEFAULT_FORBIDDEN_MESSAGE): never {
  throw new Response(message, { status: 403 });
}

async function revokeAppUserSessionsAndRedirect(
  request: Request,
  userId: string,
): Promise<never> {
  await accessAuthProvider.signOutCurrentSession(request);
  await db.delete(accessSession).where(eq(accessSession.userId, userId));
  redirectToLoginForRequest(request);
}

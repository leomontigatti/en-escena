import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import {
  MANDATORY_PASSWORD_CHANGE_PATH,
  PUBLIC_ACADEMY_ONBOARDING_PATH,
} from "@/lib/auth/access-paths.shared";
import {
  requireSignedInAccessState,
  requireInternalUser,
  requireSignedInUser,
} from "@/lib/auth/internal-access.server";
import type { InternalUserRole } from "@/lib/auth/internal-user-roles";

type AppRole = "academy" | InternalUserRole;
type LandingPath =
  | "/portal"
  | "/administracion"
  | "/auditoria"
  | "/juzgamiento";

const landingPaths = {
  academy: "/portal",
  admin: "/administracion",
  auditor: "/auditoria",
  judge: "/juzgamiento",
} satisfies Record<AppRole, LandingPath>;

export async function getLandingPathForSignedInUser(request: Request) {
  const accessState = await requireSignedInAccessState(request);

  if (accessState.kind === "academy-onboarding") {
    return PUBLIC_ACADEMY_ONBOARDING_PATH;
  }

  const appUser = accessState.user;

  return landingPaths[appUser.role];
}

export async function getLandingPathForUserId(userId: string) {
  return (await findLandingPathForUserId(userId)) ?? "/ingresar";
}

export async function getPostLoginPathForUserId(
  userId: string,
  redirectTo?: string | null,
) {
  const appUser = await db.query.user.findFirst({
    columns: { role: true, requiresPasswordChange: true },
    where: eq(user.id, userId),
  });

  if (!appUser) {
    return "/ingresar";
  }

  if (appUser.role !== "academy" && appUser.requiresPasswordChange) {
    return MANDATORY_PASSWORD_CHANGE_PATH;
  }

  if (appUser.role === "academy") {
    const academy = await db.query.academies.findFirst({
      columns: { id: true },
      where: eq(academies.userId, userId),
    });

    if (!academy) {
      return PUBLIC_ACADEMY_ONBOARDING_PATH;
    }
  }

  return redirectTo ?? landingPaths[appUser.role];
}

export async function redirectSignedInUserFromPublicRoute(request: Request) {
  const session = await accessAuthProvider.getAccessSession(request);

  if (!session) {
    return null;
  }

  const landingPath = await getPostLoginPathForRequest(request);

  if (!landingPath) {
    return null;
  }

  throw redirect(landingPath);
}

export async function getPostLoginPathForRequest(
  request: Request,
  redirectTo?: string | null,
) {
  const accessState = await requireSignedInAccessState(request, {
    allowMandatoryPasswordChange: true,
  });

  if (accessState.kind === "academy-onboarding") {
    return PUBLIC_ACADEMY_ONBOARDING_PATH;
  }

  if (
    accessState.user.role !== "academy" &&
    accessState.user.requiresPasswordChange
  ) {
    return MANDATORY_PASSWORD_CHANGE_PATH;
  }

  if (accessState.user.role === "academy") {
    const academy = await db.query.academies.findFirst({
      columns: { id: true },
      where: eq(academies.userId, accessState.user.id),
    });

    if (!academy) {
      return PUBLIC_ACADEMY_ONBOARDING_PATH;
    }
  }

  return redirectTo ?? landingPaths[accessState.user.role];
}

async function findLandingPathForUserId(userId: string) {
  const appUser = await db.query.user.findFirst({
    columns: { role: true },
    where: eq(user.id, userId),
  });

  return appUser ? landingPaths[appUser.role] : null;
}

export async function requireAdminPanelUser(request: Request) {
  return await requirePanelUser(request, "admin");
}

export async function requireAuditorPanelUser(request: Request) {
  return await requirePanelUser(request, "auditor");
}

export async function requireJudgePanelUser(request: Request) {
  return await requirePanelUser(request, "judge");
}

async function requirePanelUser(request: Request, role: InternalUserRole) {
  return await requireInternalUser(request, [role]);
}

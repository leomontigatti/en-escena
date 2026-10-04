import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { PUBLIC_ACADEMY_ONBOARDING_PATH } from "@/lib/auth/access-paths.shared";
import { createLegacySessionCookieClearHeaders } from "@/lib/auth/legacy-session-cookies.server";
import {
  requireSignedInAccessState,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import type { InternalUserRole } from "@/lib/auth/internal-user-roles";
import { adminPanelReaderRoles } from "@/lib/auth/admin-panel-access";

type AppRole = "academy" | InternalUserRole;
type LandingPath = "/portal" | "/administracion" | "/juzgamiento";

const landingPaths = {
  academy: "/portal",
  admin: "/administracion",
  // The auditor reads the same panel the administrator works in.
  auditor: "/administracion",
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
    columns: { role: true },
    where: eq(user.id, userId),
  });

  if (!appUser) {
    return "/ingresar";
  }

  return await getPostLoginPathForAppUser(
    {
      ...appUser,
      id: userId,
    },
    redirectTo,
  );
}

export async function redirectSignedInUserFromPublicRoute(request: Request) {
  const session = await accessAuthProvider.getAccessSession(request);

  if (!session) {
    return {
      headers: createLegacySessionCookieClearHeaders(request),
    };
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
  const accessState = await requireSignedInAccessState(request);

  if (accessState.kind === "academy-onboarding") {
    return PUBLIC_ACADEMY_ONBOARDING_PATH;
  }

  return await getPostLoginPathForAppUser(accessState.user, redirectTo);
}

async function getPostLoginPathForAppUser(
  appUser: {
    id: string;
    role: AppRole;
  },
  redirectTo?: string | null,
) {
  if (appUser.role === "academy") {
    const academy = await db.query.academies.findFirst({
      columns: { id: true },
      where: eq(academies.userId, appUser.id),
    });

    if (!academy) {
      return PUBLIC_ACADEMY_ONBOARDING_PATH;
    }
  }

  return redirectTo ?? landingPaths[appUser.role];
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

/**
 * Whoever may read the `Panel de administración`: the administrator, and the
 * auditor who reads it without writing. Only the layout and the views reviewed
 * for the auditor use it; every other loader keeps admitting `admin` alone.
 */
export async function requireAdminPanelReader(request: Request) {
  return await requireInternalUser(request, adminPanelReaderRoles);
}

export async function requireJudgePanelUser(request: Request) {
  return await requirePanelUser(request, "judge");
}

async function requirePanelUser(request: Request, role: InternalUserRole) {
  return await requireInternalUser(request, [role]);
}

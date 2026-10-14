import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { PUBLIC_ACADEMY_ONBOARDING_PATH } from "@/lib/auth/access-paths.shared";
import { createLegacySessionCookieClearHeaders } from "@/lib/auth/legacy-session-cookies.server";
import { requireSignedInAccessState } from "@/lib/auth/internal-access.server";
import { getLandingPath, type UserRole } from "@/lib/auth/user-role.shared";

export async function getLandingPathForSignedInUser(request: Request) {
  const accessState = await requireSignedInAccessState(request);

  if (accessState.kind === "academy-onboarding") {
    return PUBLIC_ACADEMY_ONBOARDING_PATH;
  }

  const appUser = accessState.user;

  return getLandingPath(appUser.role);
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
    role: UserRole;
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

  return redirectTo ?? getLandingPath(appUser.role);
}

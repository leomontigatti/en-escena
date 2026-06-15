import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import {
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
  const appUser = await requireSignedInUser(request);

  return landingPaths[appUser.role];
}

export async function getLandingPathForUserId(userId: string) {
  return (await findLandingPathForUserId(userId)) ?? "/ingresar";
}

export async function redirectSignedInUserFromPublicRoute(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return null;
  }

  const landingPath = await findLandingPathForUserId(session.user.id);

  if (!landingPath) {
    return null;
  }

  throw redirect(landingPath);
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

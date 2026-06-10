import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import {
  requireInternalUser,
  requireSignedInUser,
} from "@/lib/internal-access.server";
import type { InternalUserRole } from "@/lib/internal-user-roles";

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
  const appUser = await db.query.user.findFirst({
    columns: { role: true },
    where: eq(user.id, userId),
  });

  return appUser ? landingPaths[appUser.role] : "/ingresar";
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

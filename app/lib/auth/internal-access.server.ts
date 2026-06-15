import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { redirectToLoginForRequest } from "@/lib/auth/access-redirects.server";
import { auth } from "@/lib/auth/auth.server";
import {
  INTERNAL_USER_ROLES,
  isInternalUserRole,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";

type AppUser = {
  id: string;
  email: string;
  role: "academy" | InternalUserRole;
};

const DEFAULT_FORBIDDEN_MESSAGE = "No tenés permiso para acceder a esta vista.";

export async function requireSignedInUser(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    redirectToLoginForRequest(request);
  }

  const appUser = await db.query.user.findFirst({
    columns: { id: true, email: true, role: true },
    where: eq(user.id, session.user.id),
  });

  if (!appUser) {
    redirectToLoginForRequest(request);
  }

  return appUser satisfies AppUser;
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
    throwForbidden("Este usuario no tiene una academia vinculada.");
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

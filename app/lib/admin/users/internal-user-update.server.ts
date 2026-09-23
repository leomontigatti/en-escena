import { eq } from "drizzle-orm";

import { db } from "@/db";
import { accessSession, user } from "@/db/schema";
import {
  isInternalUserRole,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";

type UpdateInternalUserInput = {
  userId: string;
  name: string;
  role: InternalUserRole;
  updatedByUserId: string;
};

type UpdateInternalUserResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      error: string;
    };

export async function updateInternalUser(
  input: UpdateInternalUserInput,
): Promise<UpdateInternalUserResult> {
  const adminUser = await db.query.user.findFirst({
    columns: { id: true, role: true },
    where: eq(user.id, input.updatedByUserId),
  });

  if (adminUser?.role !== "admin") {
    return updateError("Solo administración puede editar usuarios internos.");
  }

  const existingUser = await db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      internalUsername: true,
      name: true,
      requiresPasswordChange: true,
      role: true,
      sessionInvalidBefore: true,
      suspended: true,
    },
    where: eq(user.id, input.userId),
  });

  if (!existingUser) {
    return updateError("No encontramos ese Usuario.");
  }

  if (
    !existingUser.internalUsername ||
    !isInternalUserRole(existingUser.role) ||
    !isInternalUserRole(input.role)
  ) {
    return updateError("Solo podés editar Usuarios internos.");
  }

  const name = input.name.trim();

  if (!name) {
    return updateError("Ingresá el nombre visible.");
  }

  // An administrator's permission is locked: the application never demotes one,
  // so this single rule subsumes the old self and last-active-admin checks.
  if (existingUser.role === "admin" && input.role !== "admin") {
    return updateError("No se puede cambiar el permiso de un Administrador.");
  }

  const roleChanged = existingUser.role !== input.role;
  const invalidatedAt = roleChanged
    ? new Date()
    : existingUser.sessionInvalidBefore;

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({
        name,
        role: input.role,
        sessionInvalidBefore: invalidatedAt,
      })
      .where(eq(user.id, existingUser.id));

    if (roleChanged) {
      await tx
        .delete(accessSession)
        .where(eq(accessSession.userId, existingUser.id));
    }
  });

  return {
    ok: true,
    userId: existingUser.id,
  };
}

function updateError(error: string): UpdateInternalUserResult {
  return { ok: false, error };
}

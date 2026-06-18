import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { accessSession, administrativeAuditEntries, user } from "@/db/schema";
import { normalizeEmail } from "@/lib/academies/registration-token.server";
import {
  buildInternalCredentialEmail,
  getInternalOptionalEmail,
} from "@/lib/admin/users/internal-user-credentials.server";
import {
  isInternalUserRole,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";

type UpdateInternalUserInput = {
  userId: string;
  name: string;
  role: InternalUserRole;
  email?: string;
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

type InternalUserAuditSnapshot = {
  email: string | null;
  internalUsername: string;
  name: string;
  requiresPasswordChange: boolean;
  role: InternalUserRole;
  suspended: boolean;
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

  const internalUsername = existingUser.internalUsername;

  const name = input.name.trim();

  if (!name) {
    return updateError("Ingresá el nombre visible.");
  }

  const normalizedOptionalEmail = input.email?.trim()
    ? normalizeEmail(input.email)
    : null;
  const nextEmail =
    normalizedOptionalEmail ?? buildInternalCredentialEmail(internalUsername);

  const emailConflict = await db.query.user.findFirst({
    columns: { id: true },
    where: and(eq(user.email, nextEmail), ne(user.id, existingUser.id)),
  });

  if (emailConflict) {
    return updateError(
      normalizedOptionalEmail
        ? "Ese correo ya tiene un usuario en En Escena."
        : "No pudimos reservar el acceso interno. Intentá más tarde.",
    );
  }

  if (existingUser.role === "admin" && input.role !== "admin") {
    if (existingUser.id === input.updatedByUserId) {
      return updateError(
        "No podés cambiar tu propio permiso de Administrador.",
      );
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(user)
      .where(and(eq(user.role, "admin"), eq(user.suspended, false)));

    if (Number(count) <= 1) {
      return updateError(
        "No podés cambiar el permiso del último Administrador activo.",
      );
    }
  }

  const beforeValues: InternalUserAuditSnapshot = {
    email: getInternalOptionalEmail({
      email: existingUser.email,
      internalUsername,
    }),
    internalUsername,
    name: existingUser.name,
    requiresPasswordChange: existingUser.requiresPasswordChange,
    role: existingUser.role,
    suspended: existingUser.suspended,
  };
  const afterValues: InternalUserAuditSnapshot = {
    email: normalizedOptionalEmail,
    internalUsername,
    name,
    requiresPasswordChange: existingUser.requiresPasswordChange,
    role: input.role,
    suspended: existingUser.suspended,
  };
  const roleChanged = existingUser.role !== input.role;
  const invalidatedAt = roleChanged
    ? new Date()
    : existingUser.sessionInvalidBefore;

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({
        email: nextEmail,
        emailVerified: false,
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

    await tx.insert(administrativeAuditEntries).values({
      entityType: "user",
      entityId: existingUser.id,
      adminUserId: input.updatedByUserId,
      action: "update",
      reason: null,
      beforeValues,
      afterValues,
    });
  });

  return {
    ok: true,
    userId: existingUser.id,
  };
}

function updateError(error: string): UpdateInternalUserResult {
  return { ok: false, error };
}

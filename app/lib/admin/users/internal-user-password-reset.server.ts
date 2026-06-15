import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db } from "@/db";
import {
  account,
  administrativeAuditEntries,
  session,
  user,
} from "@/db/schema";
import { getInternalOptionalEmail } from "@/lib/admin/users/internal-user-credentials.server";
import {
  isInternalUserRole,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";

export const TEMPORARY_PASSWORD_MIN_LENGTH = 8;

type ResetInternalUserPasswordInput = {
  temporaryPassword: string;
  targetUserId: string;
  updatedByUserId: string;
};

type ResetInternalUserPasswordResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      error: string;
    };

type InternalUserPasswordResetAuditSnapshot = {
  email: string | null;
  internalUsername: string;
  name: string;
  requiresPasswordChange: boolean;
  role: InternalUserRole;
  suspended: boolean;
};

export async function resetInternalUserPassword(
  input: ResetInternalUserPasswordInput,
): Promise<ResetInternalUserPasswordResult> {
  const adminUser = await db.query.user.findFirst({
    columns: { id: true, role: true },
    where: eq(user.id, input.updatedByUserId),
  });

  if (adminUser?.role !== "admin") {
    return resetPasswordError(
      "Solo administración puede restablecer contraseñas internas.",
    );
  }

  if (input.temporaryPassword.length < TEMPORARY_PASSWORD_MIN_LENGTH) {
    return resetPasswordError(
      "La contraseña temporal debe tener al menos 8 caracteres.",
    );
  }

  const existingUser = await db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      internalUsername: true,
      name: true,
      requiresPasswordChange: true,
      role: true,
      suspended: true,
    },
    where: eq(user.id, input.targetUserId),
  });

  if (!existingUser) {
    return resetPasswordError("No encontramos ese Usuario.");
  }

  if (
    !existingUser.internalUsername ||
    !isInternalUserRole(existingUser.role)
  ) {
    return resetPasswordError(
      "Solo podés restablecer contraseñas de Usuarios internos.",
    );
  }

  const credentialAccount = await db.query.account.findFirst({
    columns: { id: true },
    where: and(
      eq(account.userId, existingUser.id),
      eq(account.providerId, "credential"),
    ),
  });

  if (!credentialAccount) {
    return resetPasswordError(
      "No pudimos actualizar la contraseña de este Usuario.",
    );
  }

  const nextPasswordHash = await hashPassword(input.temporaryPassword);
  const beforeValues: InternalUserPasswordResetAuditSnapshot = {
    email: getInternalOptionalEmail({
      email: existingUser.email,
      internalUsername: existingUser.internalUsername,
    }),
    internalUsername: existingUser.internalUsername,
    name: existingUser.name,
    requiresPasswordChange: existingUser.requiresPasswordChange,
    role: existingUser.role,
    suspended: existingUser.suspended,
  };
  const afterValues: InternalUserPasswordResetAuditSnapshot = {
    ...beforeValues,
    requiresPasswordChange: true,
  };

  await db.transaction(async (tx) => {
    await tx
      .update(account)
      .set({ password: nextPasswordHash })
      .where(eq(account.id, credentialAccount.id));

    await tx
      .update(user)
      .set({ requiresPasswordChange: true })
      .where(eq(user.id, existingUser.id));

    await tx.delete(session).where(eq(session.userId, existingUser.id));

    await tx.insert(administrativeAuditEntries).values({
      entityType: "user",
      entityId: existingUser.id,
      adminUserId: input.updatedByUserId,
      action: "reset-password",
      reason: null,
      beforeValues,
      afterValues,
    });
  });

  return { ok: true, userId: existingUser.id };
}

function resetPasswordError(error: string): ResetInternalUserPasswordResult {
  return { ok: false, error };
}

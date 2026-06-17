import { eq } from "drizzle-orm";

import { db } from "@/db";
import { administrativeAuditEntries, user } from "@/db/schema";
import { getInternalOptionalEmail } from "@/lib/admin/users/internal-user-credentials.server";
import {
  revokeInternalCredentialSessions,
  setInternalCredentialPassword,
} from "@/lib/auth/internal-user-auth.server";
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

  const invalidatedAt = new Date();
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

  try {
    await setInternalCredentialPassword({
      password: input.temporaryPassword,
      userId: existingUser.id,
    });
  } catch {
    return resetPasswordError(
      "No pudimos actualizar la contraseña de este Usuario.",
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({
        requiresPasswordChange: true,
        sessionInvalidBefore: invalidatedAt,
      })
      .where(eq(user.id, existingUser.id));

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

  await revokeInternalCredentialSessions(existingUser.id);

  return { ok: true, userId: existingUser.id };
}

function resetPasswordError(error: string): ResetInternalUserPasswordResult {
  return { ok: false, error };
}

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import {
  revokeInternalCredentialSessions,
  setInternalCredentialPassword,
} from "@/lib/auth/internal-user-auth.server";
import { isInternalUserRole } from "@/lib/auth/internal-user-roles";

const TEMPORARY_PASSWORD_MIN_LENGTH = 8;

type ResetInternalUserPasswordInput = {
  temporaryPassword: string;
  targetUserId: string;
  updatedByUserId: string;
  adminHeaders: Headers;
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

  try {
    await setInternalCredentialPassword(
      {
        password: input.temporaryPassword,
        userId: existingUser.id,
      },
      input.adminHeaders,
    );
  } catch {
    return resetPasswordError(
      "No pudimos actualizar la contraseña de este Usuario.",
    );
  }

  await db
    .update(user)
    .set({
      requiresPasswordChange: true,
      sessionInvalidBefore: invalidatedAt,
    })
    .where(eq(user.id, existingUser.id));

  await revokeInternalCredentialSessions(existingUser.id);

  return { ok: true, userId: existingUser.id };
}

function resetPasswordError(error: string): ResetInternalUserPasswordResult {
  return { ok: false, error };
}

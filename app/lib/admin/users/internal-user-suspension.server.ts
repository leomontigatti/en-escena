import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { administrativeAuditEntries, user } from "@/db/schema";
import { getInternalOptionalEmail } from "@/lib/admin/users/internal-user-credentials.server";
import {
  revokeInternalCredentialSessions,
  setInternalCredentialSuspendedState,
} from "@/lib/auth/internal-user-auth.server";
import { isInternalUserRole } from "@/lib/auth/internal-user-roles";

type SetInternalUserSuspendedStateInput = {
  action: "suspend" | "reactivate";
  targetUserId: string;
  updatedByUserId: string;
  adminHeaders: Headers;
};

type SetInternalUserSuspendedStateResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      error: string;
    };

type InternalUserSuspensionAuditSnapshot = {
  email: string | null;
  internalUsername: string;
  name: string;
  requiresPasswordChange: boolean;
  role: "admin" | "auditor" | "judge";
  suspended: boolean;
};

export async function setInternalUserSuspendedState(
  input: SetInternalUserSuspendedStateInput,
): Promise<SetInternalUserSuspendedStateResult> {
  const adminUser = await db.query.user.findFirst({
    columns: { id: true, role: true },
    where: eq(user.id, input.updatedByUserId),
  });

  if (adminUser?.role !== "admin") {
    return {
      ok: false,
      error: "Solo administración puede editar usuarios internos.",
    };
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
    where: eq(user.id, input.targetUserId),
  });

  if (!existingUser) {
    return { ok: false, error: "No encontramos ese Usuario." };
  }

  if (
    !existingUser.internalUsername ||
    !isInternalUserRole(existingUser.role)
  ) {
    return { ok: false, error: "Solo podés gestionar Usuarios internos." };
  }

  const nextSuspended = input.action === "suspend";

  if (existingUser.suspended === nextSuspended) {
    return { ok: true, userId: existingUser.id };
  }

  if (input.action === "suspend") {
    if (existingUser.id === input.updatedByUserId) {
      return { ok: false, error: "No podés suspender tu propio Usuario." };
    }

    if (existingUser.role === "admin") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(user)
        .where(and(eq(user.role, "admin"), eq(user.suspended, false)));

      if (Number(count) <= 1) {
        return {
          ok: false,
          error: "No podés suspender al último Administrador activo.",
        };
      }
    }
  }

  const beforeValues: InternalUserSuspensionAuditSnapshot = {
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
  const afterValues: InternalUserSuspensionAuditSnapshot = {
    ...beforeValues,
    suspended: nextSuspended,
  };
  const invalidatedAt = nextSuspended
    ? new Date()
    : existingUser.sessionInvalidBefore;

  try {
    await setInternalCredentialSuspendedState(
      {
        suspended: nextSuspended,
        userId: existingUser.id,
      },
      input.adminHeaders,
    );
  } catch {
    return {
      ok: false,
      error: "No pudimos actualizar el acceso de este Usuario.",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({
        sessionInvalidBefore: invalidatedAt,
        suspended: nextSuspended,
      })
      .where(eq(user.id, existingUser.id));

    await tx.insert(administrativeAuditEntries).values({
      entityType: "user",
      entityId: existingUser.id,
      adminUserId: input.updatedByUserId,
      action: nextSuspended ? "archive" : "reactivate",
      reason: null,
      beforeValues,
      afterValues,
    });
  });

  if (nextSuspended) {
    await revokeInternalCredentialSessions(existingUser.id);
  }

  return { ok: true, userId: existingUser.id };
}

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { administrativeAuditEntries, session, user } from "@/db/schema";
import { isInternalUserRole } from "@/lib/auth/internal-user-roles";

type SetInternalUserSuspendedStateInput = {
  action: "suspend" | "reactivate";
  targetUserId: string;
  updatedByUserId: string;
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

const INTERNAL_CREDENTIAL_EMAIL_DOMAIN = "usuarios-internos.enescena.local";

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

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ suspended: nextSuspended })
      .where(eq(user.id, existingUser.id));

    if (nextSuspended) {
      await tx.delete(session).where(eq(session.userId, existingUser.id));
    }

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

  return { ok: true, userId: existingUser.id };
}

function getInternalOptionalEmail(input: {
  email: string;
  internalUsername: string;
}) {
  return input.email === buildInternalCredentialEmail(input.internalUsername)
    ? null
    : input.email;
}

function buildInternalCredentialEmail(internalUsername: string) {
  return `${internalUsername}@${INTERNAL_CREDENTIAL_EMAIL_DOMAIN}`;
}

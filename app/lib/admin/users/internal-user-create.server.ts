import { eq, or } from "drizzle-orm";

import { db } from "@/db";
import { administrativeAuditEntries, user } from "@/db/schema";
import { normalizeEmail } from "@/lib/academies/registration-token.server";
import { buildInternalCredentialEmail } from "@/lib/admin/users/internal-user-credentials.server";
import { assertValidInternalUsername } from "@/lib/auth/internal-username.server";
import {
  createInternalCredentialUser,
  deleteInternalCredentialUser,
} from "@/lib/auth/internal-user-auth.server";
import {
  isInternalUserRole,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";

const TEMPORARY_PASSWORD_MIN_LENGTH = 8;

type CreateInternalUserInput = {
  name: string;
  internalUsername: string;
  role: InternalUserRole;
  temporaryPassword: string;
  email?: string;
  createdByUserId: string;
};

type CreateInternalUserResult =
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
  requiresPasswordChange: true;
  role: InternalUserRole;
};

export async function createInternalUser(
  input: CreateInternalUserInput,
): Promise<CreateInternalUserResult> {
  const adminUser = await db.query.user.findFirst({
    columns: { id: true, role: true },
    where: eq(user.id, input.createdByUserId),
  });

  if (adminUser?.role !== "admin") {
    return creationError("Solo administración puede crear usuarios internos.");
  }

  const name = input.name.trim();

  if (!name) {
    return creationError("Ingresá el nombre visible.");
  }

  if (!isInternalUserRole(input.role)) {
    return creationError("Elegí un permiso principal válido.");
  }

  if (input.temporaryPassword.length < TEMPORARY_PASSWORD_MIN_LENGTH) {
    return creationError(
      "La contraseña temporal debe tener al menos 8 caracteres.",
    );
  }

  let internalUsername: string;

  try {
    internalUsername = assertValidInternalUsername(input.internalUsername);
  } catch {
    return creationError("Ingresá un nombre de usuario interno válido.");
  }

  const normalizedOptionalEmail = input.email?.trim()
    ? normalizeEmail(input.email)
    : null;
  const credentialEmail =
    normalizedOptionalEmail ?? buildInternalCredentialEmail(internalUsername);
  const auditSnapshot: InternalUserAuditSnapshot = {
    email: normalizedOptionalEmail,
    internalUsername,
    name,
    requiresPasswordChange: true,
    role: input.role,
  };

  const existingUser = await db.query.user.findFirst({
    columns: { id: true, email: true, internalUsername: true },
    where: or(
      eq(user.internalUsername, internalUsername),
      eq(user.email, credentialEmail),
    ),
  });

  if (existingUser?.internalUsername === internalUsername) {
    return creationError("Ese nombre de usuario interno ya existe.");
  }

  if (existingUser?.email === credentialEmail) {
    return creationError(
      getCredentialEmailConflictMessage(normalizedOptionalEmail),
    );
  }

  const credentialUser = await createInternalCredentialUser({
    email: credentialEmail,
    name,
    password: input.temporaryPassword,
  });

  let createdUser: { id: string } | null = null;

  try {
    createdUser = await db.transaction(async (tx) => {
      const existingCreatedUser = await tx.query.user.findFirst({
        columns: { id: true },
        where: eq(user.id, credentialUser.userId),
      });

      const [savedUser] = existingCreatedUser
        ? await tx
            .update(user)
            .set({
              email: credentialEmail,
              emailVerified: false,
              internalUsername,
              name,
              requiresPasswordChange: true,
              role: input.role,
            })
            .where(eq(user.id, credentialUser.userId))
            .returning({ id: user.id })
        : await tx
            .insert(user)
            .values({
              email: credentialEmail,
              emailVerified: false,
              id: credentialUser.userId,
              internalUsername,
              name,
              requiresPasswordChange: true,
              role: input.role,
            })
            .returning({ id: user.id });

      if (!savedUser) {
        throw new Error("Expected internal user to be created.");
      }

      await tx.insert(administrativeAuditEntries).values({
        entityType: "user",
        entityId: savedUser.id,
        adminUserId: input.createdByUserId,
        action: "create",
        reason: null,
        beforeValues: {},
        afterValues: auditSnapshot,
      });

      return savedUser;
    });
  } catch (error) {
    await deleteInternalCredentialUser(credentialUser.userId);
    throw error;
  }

  return { ok: true, userId: createdUser.id };
}

function creationError(error: string): CreateInternalUserResult {
  return { ok: false, error };
}

function getCredentialEmailConflictMessage(email: string | null) {
  if (email) {
    return "Ese correo ya tiene un usuario en En Escena.";
  }

  return "No pudimos reservar el acceso interno. Intentá con otro nombre de usuario.";
}

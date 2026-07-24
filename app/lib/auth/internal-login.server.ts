import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { account, user } from "@/db/schema";
import { normalizeInternalUsername } from "@/lib/auth/internal-username.server";
import {
  isInternalUserRole,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";
import { normalizeEmail } from "@/lib/shared/email-normalization";

const emailSchema = z.email();

type CredentialUserIdentifierMatch = "email" | "internalUsername";
export type CredentialUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: "academy" | InternalUserRole;
  requiresPasswordChange: boolean;
  suspended: boolean;
  match: CredentialUserIdentifierMatch;
};

export async function findCredentialUserForIdentifier(
  identifier: string,
): Promise<CredentialUser | null> {
  const trimmedIdentifier = identifier.trim();

  const internalUser = await db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      emailVerified: true,
      role: true,
      requiresPasswordChange: true,
      suspended: true,
    },
    where: eq(
      user.internalUsername,
      normalizeInternalUsername(trimmedIdentifier),
    ),
  });

  if (internalUser && isInternalUserRole(internalUser.role)) {
    return {
      ...internalUser,
      match: "internalUsername",
    };
  }

  const normalizedEmail = normalizeEmail(trimmedIdentifier);

  if (!emailSchema.safeParse(normalizedEmail).success) {
    return null;
  }

  const credentialUser = await db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      emailVerified: true,
      role: true,
      requiresPasswordChange: true,
      suspended: true,
    },
    where: eq(user.email, normalizedEmail),
  });

  if (!credentialUser) {
    return null;
  }

  return {
    ...credentialUser,
    match: "email",
  };
}

/**
 * ¿El usuario tiene una credencial con la que pueda ingresar? Better Auth no
 * distingue "sin credencial" de "contraseña incorrecta" — las dos devuelven
 * `INVALID_EMAIL_OR_PASSWORD` — así que esta es la única forma de reconocer a
 * quien viene de GoTrue y todavía no eligió una contraseña en este sistema
 * (#491). Se consulta sólo cuando el login ya falló, para no pagar la query en
 * cada ingreso exitoso.
 */
export async function hasCredentialAccount(userId: string) {
  const credentialAccount = await db.query.account.findFirst({
    columns: { id: true },
    where: and(
      eq(account.userId, userId),
      eq(account.providerId, "credential"),
    ),
  });

  return credentialAccount !== undefined;
}

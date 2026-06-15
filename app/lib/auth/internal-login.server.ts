import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { user } from "@/db/schema";
import { normalizeEmail } from "@/lib/academies/registration-token.server";
import { normalizeInternalUsername } from "@/lib/auth/internal-username.server";
import { isInternalUserRole } from "@/lib/auth/internal-user-roles";

const emailSchema = z.email();

export type CredentialUserIdentifierMatch = "email" | "internalUsername";

export async function findCredentialUserForIdentifier(identifier: string) {
  const trimmedIdentifier = identifier.trim();

  const internalUser = await db.query.user.findFirst({
    columns: {
      id: true,
      email: true,
      emailVerified: true,
      role: true,
      requiresPasswordChange: true,
    },
    where: eq(
      user.internalUsername,
      normalizeInternalUsername(trimmedIdentifier),
    ),
  });

  if (internalUser && isInternalUserRole(internalUser.role)) {
    return {
      ...internalUser,
      match: "internalUsername" as const,
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
    },
    where: eq(user.email, normalizedEmail),
  });

  if (!credentialUser) {
    return null;
  }

  return {
    ...credentialUser,
    match: "email" as const,
  };
}

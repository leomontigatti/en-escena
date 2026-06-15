import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { user } from "@/db/schema";
import { normalizeEmail } from "@/lib/academies/registration-token.server";
import { normalizeInternalUsername } from "@/lib/auth/internal-username.server";
import {
  isInternalUserRole,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";

const emailSchema = z.email();

type CredentialUserIdentifierMatch = "email" | "internalUsername";
type CredentialUser = {
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

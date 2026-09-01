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
 * Does the user have a credential they can sign in with? Better Auth does not
 * distinguish "no credential" from "wrong password" — both return
 * `INVALID_EMAIL_OR_PASSWORD` — so this is the only way to recognize someone who
 * comes from GoTrue and has not yet chosen a password in this system (#491). It
 * is queried only once sign-in has already failed, so as not to pay for the query
 * on every successful login.
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

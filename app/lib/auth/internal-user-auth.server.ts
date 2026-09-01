import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { accessSession } from "@/db/schema";
import {
  auth,
  verifyBetterAuthCredentialPassword,
} from "@/lib/auth/access-auth-provider.betterauth.server";

type InternalCredentialUserInput = {
  email: string;
  name: string;
  password: string;
};

type InternalCredentialPasswordInput = {
  userId: string;
  password: string;
};

type VerifyInternalCredentialPasswordInput = {
  email: string;
  password: string;
};

type RevokeOtherAccessSessionsInput = {
  userId: string;
  currentSessionId: string;
};

// Server-side creation of an internal user via Better Auth's admin plugin
// (#423). Without a session: `createUser` runs on the server with the email
// already confirmed (`data.emailVerified`, parity with Supabase's
// `email_confirm: true`). The real role is assigned by internal-user creation
// (`internal-user-create.server.ts`); here the plugin's `defaultRole` remains.
export async function createInternalCredentialUser(
  input: InternalCredentialUserInput,
) {
  const { user } = await auth.api.createUser({
    body: {
      email: input.email,
      name: input.name,
      password: input.password,
      data: { emailVerified: true },
    },
  });

  return { userId: user.id };
}

// Rollback of internal-user creation: deletes the user (and their
// sessions/accounts by FK cascade) using the Better Auth context's
// `internalAdapter`. There is no admin session on the rollback path, so it does
// not go through `removeUser`.
export async function deleteInternalCredentialUser(userId: string) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUser(userId);
}

// Password reset from the panel: the admin plugin's `setUserPassword` with the
// admin session's `headers`, which Better Auth requires to authorize the
// operation (research #369). The user's own (mandatory) password change does not
// come through here: it uses `upsertBetterAuthCredentialPassword` directly.
export async function setInternalCredentialPassword(
  input: InternalCredentialPasswordInput,
  adminHeaders: Headers,
) {
  await auth.api.setUserPassword({
    body: {
      newPassword: input.password,
      userId: input.userId,
    },
    headers: adminHeaders,
  });
}

export async function verifyInternalCredentialPassword(
  input: VerifyInternalCredentialPasswordInput,
) {
  return verifyBetterAuthCredentialPassword(input);
}

export async function revokeInternalCredentialSessions(userId: string) {
  await db.delete(accessSession).where(eq(accessSession.userId, userId));
}

export async function revokeOtherAccessSessions(
  input: RevokeOtherAccessSessionsInput,
) {
  await db
    .delete(accessSession)
    .where(
      and(
        eq(accessSession.userId, input.userId),
        ne(accessSession.id, input.currentSessionId),
      ),
    );
}

// Suspension (= Better Auth's `banned`) from the panel: the admin plugin's
// `banUser`/`unbanUser` with the admin session's `headers`. `banUser` marks the
// `suspended` column and revokes the internal user's sessions; `unbanUser`
// clears it.
export async function setInternalCredentialSuspendedState(
  input: {
    suspended: boolean;
    userId: string;
  },
  adminHeaders: Headers,
) {
  if (input.suspended) {
    await auth.api.banUser({
      body: { userId: input.userId },
      headers: adminHeaders,
    });
    return;
  }

  await auth.api.unbanUser({
    body: { userId: input.userId },
    headers: adminHeaders,
  });
}

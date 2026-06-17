import { and, eq, ne } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { hashPassword, verifyPassword } from "better-auth/crypto";

import { db } from "@/db";
import { account, session, user } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import { createSupabaseServerClientForRequest } from "@/lib/auth/supabase-auth-ssr.server";

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
  request: Request;
  userId: string;
  currentSessionId: string;
};

export async function createInternalCredentialUser(
  input: InternalCredentialUserInput,
) {
  if (isTestAccessAuthMode()) {
    const result = await auth.api.signUpEmail({
      body: {
        email: input.email,
        name: input.name,
        password: input.password,
      },
    });

    return { userId: result.user.id };
  }

  const client = createSupabaseAdminClient();
  const { data, error } = await client.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    password: input.password,
    user_metadata: {
      name: input.name,
    },
  });

  if (error || !data.user?.id) {
    throw error ?? new Error("Supabase internal user creation failed.");
  }

  return { userId: data.user.id };
}

export async function deleteInternalCredentialUser(userId: string) {
  if (isTestAccessAuthMode()) {
    return;
  }

  const { error } =
    await createSupabaseAdminClient().auth.admin.deleteUser(userId);

  if (error) {
    throw error;
  }
}

export async function setInternalCredentialPassword(
  input: InternalCredentialPasswordInput,
) {
  if (isTestAccessAuthMode()) {
    const passwordHash = await hashPassword(input.password);
    const credentialAccount = await db.query.account.findFirst({
      columns: { id: true },
      where: and(
        eq(account.userId, input.userId),
        eq(account.providerId, "credential"),
      ),
    });

    if (credentialAccount) {
      await db
        .update(account)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(eq(account.id, credentialAccount.id));
      return;
    }

    await db.insert(account).values({
      accountId: input.userId,
      password: passwordHash,
      providerId: "credential",
      userId: input.userId,
    });
    return;
  }

  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(
    input.userId,
    { password: input.password },
  );

  if (error) {
    throw error;
  }
}

export async function verifyInternalCredentialPassword(
  input: VerifyInternalCredentialPasswordInput,
) {
  if (isTestAccessAuthMode()) {
    const passwordHash = await findCredentialPasswordHashByEmail(input.email);

    if (!passwordHash) {
      return false;
    }

    return await verifyPassword({
      hash: passwordHash,
      password: input.password,
    });
  }

  const client = createStatelessSupabaseAuthClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.session) {
    return false;
  }

  const signOutResult = await client.auth.signOut({ scope: "global" });

  if (signOutResult.error) {
    throw signOutResult.error;
  }

  return true;
}

export async function revokeInternalCredentialSessions(userId: string) {
  if (isTestAccessAuthMode()) {
    await db.delete(session).where(eq(session.userId, userId));
  }
}

export async function revokeOtherAccessSessions(
  input: RevokeOtherAccessSessionsInput,
) {
  if (isTestAccessAuthMode()) {
    await db
      .delete(session)
      .where(
        and(
          eq(session.userId, input.userId),
          ne(session.id, input.currentSessionId),
        ),
      );
    return;
  }

  const { client } = createSupabaseServerClientForRequest(input.request);
  const { error } = await client.auth.signOut({ scope: "others" });

  if (error) {
    throw error;
  }
}

export async function setInternalCredentialSuspendedState(input: {
  suspended: boolean;
  userId: string;
}) {
  if (isTestAccessAuthMode()) {
    return;
  }

  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(
    input.userId,
    {
      ban_duration: input.suspended ? "876000h" : "none",
    },
  );

  if (error) {
    throw error;
  }
}

function createSupabaseAdminClient() {
  return createClient(
    getRequiredSupabaseEnv("SUPABASE_URL"),
    getRequiredSupabaseEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function createStatelessSupabaseAuthClient() {
  return createClient(
    getRequiredSupabaseEnv("SUPABASE_URL"),
    getRequiredSupabaseEnv("SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function getRequiredSupabaseEnv(
  name:
    | "SUPABASE_PUBLISHABLE_KEY"
    | "SUPABASE_SERVICE_ROLE_KEY"
    | "SUPABASE_URL",
) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Supabase internal auth.`);
  }

  return value;
}

function isTestAccessAuthMode() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

async function findCredentialPasswordHashByEmail(email: string) {
  const savedUser = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });

  if (!savedUser) {
    return null;
  }

  const credentialAccount = await db.query.account.findFirst({
    columns: { password: true },
    where: and(
      eq(account.providerId, "credential"),
      eq(account.userId, savedUser.id),
    ),
  });

  return credentialAccount?.password ?? null;
}

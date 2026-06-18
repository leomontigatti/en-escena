import { and, eq, ne } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

import { db } from "@/db";
import { accessSession } from "@/db/schema";
import {
  createLocalAccessUser,
  upsertLocalAccessPassword,
  verifyLocalAccessPassword,
} from "@/lib/auth/access-test-auth.server";
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
    const result = await createLocalAccessUser({
      email: input.email,
      name: input.name,
      password: input.password,
    });

    return { userId: result.response.user.id };
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
    await upsertLocalAccessPassword(input);
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
    return verifyLocalAccessPassword(input);
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
    await db.delete(accessSession).where(eq(accessSession.userId, userId));
  }
}

export async function revokeOtherAccessSessions(
  input: RevokeOtherAccessSessionsInput,
) {
  if (isTestAccessAuthMode()) {
    await db
      .delete(accessSession)
      .where(
        and(
          eq(accessSession.userId, input.userId),
          ne(accessSession.id, input.currentSessionId),
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

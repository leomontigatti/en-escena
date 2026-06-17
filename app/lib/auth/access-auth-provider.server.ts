import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";
import { parse, serialize } from "cookie";
import { createClient } from "@supabase/supabase-js";

import { db } from "@/db";
import { session as sessionTable, user } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import {
  createSupabaseServerClientForRequest,
  getRequiredSupabaseEnv,
} from "@/lib/auth/supabase-auth-ssr.server";

type CredentialUserInput = {
  email: string;
  password: string;
  request: Request;
};

type AccessSession = {
  session: {
    id: string | null;
  };
  user: {
    email: string;
    id: string;
  };
};

export type AccessCredentialUser = {
  userId: string;
  headers: Headers;
};

const TEST_SUPABASE_ACCESS_COOKIE_NAME = "sb-access-token";
const BETTER_AUTH_SESSION_COOKIE_NAME = "better-auth.session_token";
const BETTER_AUTH_SESSION_COOKIE_PATTERN = /better-auth\.session_token=([^;]+)/;

export const accessAuthProvider = {
  async getAccessSession(request: Request): Promise<AccessSession | null> {
    if (isTestAccessAuthMode()) {
      return await getTestAccessSession(request);
    }

    const { client } = createSupabaseServerClientForRequest(request);
    const {
      data: { user: verifiedUser },
    } = await client.auth.getUser();

    if (!verifiedUser?.id || !verifiedUser.email) {
      return null;
    }

    const {
      data: { session },
    } = await client.auth.getSession();

    return {
      session: {
        id: session?.access_token ?? null,
      },
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
      },
    };
  },

  async signInCredentialUser(
    input: CredentialUserInput,
  ): Promise<AccessCredentialUser> {
    if (isTestAccessAuthMode()) {
      return await signInTestCredentialUser(input);
    }

    return await signInSupabaseCredentialUser(input);
  },

  async signOutCurrentSession(request: Request) {
    if (isTestAccessAuthMode()) {
      const sessionToken = readTestSupabaseSessionToken(request);

      if (sessionToken) {
        await db
          .delete(sessionTable)
          .where(eq(sessionTable.token, sessionToken));
      }

      return {
        headers: buildTestSupabaseHeaders(),
      };
    }

    const { client, responseHeaders } =
      createSupabaseServerClientForRequest(request);
    const { error } = await client.auth.signOut();

    if (error) {
      throw error;
    }

    return {
      headers: responseHeaders,
    };
  },

  async signUpCredentialUser(
    input: CredentialUserInput,
  ): Promise<AccessCredentialUser> {
    if (isTestAccessAuthMode()) {
      return await signUpTestCredentialUser(input);
    }

    return await signUpSupabaseCredentialUser(input);
  },

  async registerAcademyAccessUser(
    input: CredentialUserInput,
  ): Promise<AccessCredentialUser> {
    if (isTestAccessAuthMode()) {
      return await signUpTestCredentialUser(input);
    }

    return await registerAcademySupabaseAccessUser(input);
  },

  async deleteAccessUser(userId: string) {
    if (isTestAccessAuthMode()) {
      await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
      await db.delete(user).where(eq(user.id, userId));
      return;
    }

    const { error } =
      await createSupabaseAdminClient().auth.admin.deleteUser(userId);

    if (error) {
      throw error;
    }
  },

  async requestPasswordReset(input: {
    email: string;
    redirectTo: string;
    requestOrigin: string;
  }) {
    await auth.api.requestPasswordReset({
      body: {
        email: input.email,
        redirectTo: input.redirectTo,
      },
      headers: new Headers({
        origin: input.requestOrigin,
      }),
    });
  },

  async resetPassword(input: {
    token: string;
    newPassword: string;
    request: Request;
  }) {
    await auth.api.resetPassword({
      body: {
        token: input.token,
        newPassword: input.newPassword,
      },
      headers: input.request.headers,
    });
  },
};

function isTestAccessAuthMode() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

async function signInTestCredentialUser(
  input: CredentialUserInput,
): Promise<AccessCredentialUser> {
  const result = await auth.api.signInEmail({
    body: {
      email: input.email,
      password: input.password,
    },
    headers: input.request.headers,
    returnHeaders: true,
  });

  return {
    userId: result.response.user.id,
    headers: buildTestSupabaseHeaders(result.headers),
  };
}

async function signInSupabaseCredentialUser(
  input: CredentialUserInput,
): Promise<AccessCredentialUser> {
  const { client, responseHeaders } = createSupabaseServerClientForRequest(
    input.request,
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.user?.id) {
    throw error ?? new Error("Supabase sign-in failed.");
  }

  return {
    userId: await findOrCreateAppUserForAccessUser(data.user),
    headers: responseHeaders,
  };
}

async function signUpTestCredentialUser(
  input: CredentialUserInput,
): Promise<AccessCredentialUser> {
  const result = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.email,
      password: input.password,
    },
    headers: input.request.headers,
    returnHeaders: true,
  });

  return {
    userId: result.response.user.id,
    headers: buildTestSupabaseHeaders(result.headers),
  };
}

async function signUpSupabaseCredentialUser(
  input: CredentialUserInput,
): Promise<AccessCredentialUser> {
  const { client, responseHeaders } = createSupabaseServerClientForRequest(
    input.request,
  );
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        name: input.email,
      },
    },
  });

  if (error || !data.user?.id || !data.user.email) {
    throw error ?? new Error("Supabase sign-up failed.");
  }

  return {
    userId: await findOrCreateAppUserForAccessUser(data.user),
    headers: responseHeaders,
  };
}

async function registerAcademySupabaseAccessUser(
  input: CredentialUserInput,
): Promise<AccessCredentialUser> {
  const adminClient = createSupabaseAdminClient();
  const { data: createdUserData, error: createUserError } =
    await adminClient.auth.admin.createUser({
      email: input.email,
      email_confirm: true,
      password: input.password,
      user_metadata: {
        name: input.email,
      },
    });

  if (createUserError || !createdUserData.user?.id) {
    throw createUserError ?? new Error("Supabase academy registration failed.");
  }

  const { client, responseHeaders } = createSupabaseServerClientForRequest(
    input.request,
  );
  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

  if (signInError || !signInData.user?.id) {
    await adminClient.auth.admin.deleteUser(createdUserData.user.id);
    throw signInError ?? new Error("Supabase academy sign-in failed.");
  }

  return {
    userId: createdUserData.user.id,
    headers: responseHeaders,
  };
}

async function getTestAccessSession(
  request: Request,
): Promise<AccessSession | null> {
  const sessionToken = readTestSupabaseSessionToken(request);

  if (!sessionToken) {
    return null;
  }

  const savedSession = await db.query.session.findFirst({
    columns: {
      expiresAt: true,
      id: true,
      userId: true,
    },
    where: and(
      eq(sessionTable.token, sessionToken),
      gt(sessionTable.expiresAt, new Date()),
    ),
  });

  if (!savedSession) {
    return null;
  }

  const savedUser = await db.query.user.findFirst({
    columns: {
      email: true,
      id: true,
    },
    where: eq(user.id, savedSession.userId),
  });

  if (!savedUser?.email) {
    return null;
  }

  return {
    session: {
      id: savedSession.id,
    },
    user: {
      email: savedUser.email,
      id: savedUser.id,
    },
  };
}

function buildTestSupabaseHeaders(betterAuthHeaders?: Headers) {
  const headers = new Headers();
  const betterAuthSessionToken = betterAuthHeaders
    ? extractBetterAuthSessionToken(betterAuthHeaders)
    : null;

  headers.append(
    "set-cookie",
    serialize(
      TEST_SUPABASE_ACCESS_COOKIE_NAME,
      signTestSupabaseSessionToken(betterAuthSessionToken),
      {
        httpOnly: true,
        maxAge: betterAuthSessionToken ? undefined : 0,
        path: "/",
        sameSite: "lax",
      },
    ),
  );

  return headers;
}

function extractBetterAuthSessionToken(headers: Headers) {
  const setCookie = headers.get("set-cookie");
  const sessionCookie = setCookie?.match(BETTER_AUTH_SESSION_COOKIE_PATTERN);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return sessionCookie[1].split(".")[0] ?? null;
}

function readTestSupabaseSessionToken(request: Request) {
  const cookies = parse(request.headers.get("cookie") ?? "");
  const signedToken = cookies[TEST_SUPABASE_ACCESS_COOKIE_NAME];

  if (signedToken) {
    return verifySignedTestSupabaseSessionToken(signedToken);
  }

  const legacySessionToken = cookies[BETTER_AUTH_SESSION_COOKIE_NAME];

  return legacySessionToken?.split(".")[0] ?? null;
}

function signTestSupabaseSessionToken(sessionToken: string | null) {
  if (!sessionToken) {
    return "";
  }

  return `${sessionToken}.${signTestSupabaseSession(sessionToken)}`;
}

function verifySignedTestSupabaseSessionToken(signedToken: string) {
  const separatorIndex = signedToken.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const sessionToken = signedToken.slice(0, separatorIndex);
  const signature = signedToken.slice(separatorIndex + 1);
  const expectedSignature = signTestSupabaseSession(sessionToken);

  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  return sessionToken;
}

function getTestAccessAuthSecret() {
  return process.env.BETTER_AUTH_SECRET ?? "test-access-auth-secret";
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

function signTestSupabaseSession(sessionToken: string) {
  return createHmac("sha256", getTestAccessAuthSecret())
    .update(sessionToken)
    .digest("hex");
}

async function findOrCreateAppUserForAccessUser(input: {
  email?: string | null;
  id: string;
}) {
  if (!input.email) {
    return input.id;
  }

  const existingUser = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, input.email),
  });

  if (existingUser) {
    return existingUser.id;
  }

  await db.insert(user).values({
    email: input.email,
    emailVerified: true,
    id: input.id,
    name: input.email,
  });

  return input.id;
}

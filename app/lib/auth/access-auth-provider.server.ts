import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { parse, serialize } from "cookie";
import { createClient } from "@supabase/supabase-js";

import { db } from "@/db";
import { accessCredential, accessSession, user } from "@/db/schema";
import {
  buildLocalAccessSessionHeaders,
  createLocalAccessPasswordHash,
  createLocalAccessUser,
  readLocalAccessSession,
  signInLocalAccessUser,
  TEST_ACCESS_SESSION_COOKIE_NAME,
} from "@/lib/auth/access-test-auth.server";
import {
  createSupabaseServerClientForRequest,
  getRequiredSupabaseEnv,
} from "@/lib/auth/supabase-auth-ssr.server";

type CredentialUserInput = {
  email: string;
  password: string;
  request: Request;
};
type EmailSignUpInput = CredentialUserInput & {
  redirectTo: string;
};

type AccessSession = {
  session: {
    id: string | null;
    issuedAt: Date | null;
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

const TEST_SUPABASE_RECOVERY_COOKIE_NAME = "sb-recovery-user";
const testRecoveryCodes = new Map<string, string>();

export const accessAuthProvider = {
  async getAccessSession(request: Request): Promise<AccessSession | null> {
    if (isTestAccessAuthMode()) {
      return await getTestAccessSession(request);
    }

    const { client } = createSupabaseServerClientForRequest(request);
    let verifiedUser: { email?: string | null; id?: string | null } | null;

    try {
      const {
        data: { user },
      } = await client.auth.getUser();

      verifiedUser = user;
    } catch (error) {
      if (isMissingSupabaseRefreshTokenError(error)) {
        return null;
      }

      throw error;
    }

    if (!verifiedUser?.id || !verifiedUser.email) {
      return null;
    }

    let session: { access_token?: string | null } | null;

    try {
      const {
        data: { session: activeSession },
      } = await client.auth.getSession();

      session = activeSession;
    } catch (error) {
      if (isMissingSupabaseRefreshTokenError(error)) {
        return null;
      }

      throw error;
    }

    const appUserId = await findAppUserIdForAccessUser({
      email: verifiedUser.email,
      id: verifiedUser.id,
    });

    return {
      session: {
        id: session?.access_token ?? null,
        issuedAt: getIssuedAtForAccessToken(session?.access_token ?? null),
      },
      user: {
        id: appUserId ?? verifiedUser.id,
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
          .delete(accessSession)
          .where(eq(accessSession.token, sessionToken));
      }

      return {
        headers: mergeTestHeaders(
          buildLocalAccessSessionHeaders(null),
          buildTestRecoveryHeaders(null),
        ),
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

  async startEmailSignUp(input: EmailSignUpInput) {
    if (isTestAccessAuthMode()) {
      return await startTestEmailSignUp(input);
    }

    return await startSupabaseEmailSignUp(input);
  },

  async deleteAccessUser(userId: string) {
    if (isTestAccessAuthMode()) {
      await db.delete(accessSession).where(eq(accessSession.userId, userId));
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
    request: Request;
  }) {
    if (isTestAccessAuthMode()) {
      const recoveryCode = crypto.randomUUID();

      testRecoveryCodes.set(recoveryCode, input.email);

      return {
        headers: new Headers(),
        debugRecoveryCode: recoveryCode,
      };
    }

    const { client, responseHeaders } = createSupabaseServerClientForRequest(
      input.request,
    );
    const { error } = await client.auth.resetPasswordForEmail(input.email, {
      redirectTo: input.redirectTo,
    });

    if (error) {
      throw error;
    }

    return {
      headers: responseHeaders,
    };
  },

  async exchangePasswordRecoveryCode(input: {
    code: string;
    request: Request;
    redirectTo: string;
  }) {
    if (isTestAccessAuthMode()) {
      const recoveryEmail = testRecoveryCodes.get(input.code);

      if (!recoveryEmail) {
        throw new Error("Invalid recovery code.");
      }

      const recoveryUser = await db.query.user.findFirst({
        columns: {
          email: true,
          id: true,
        },
        where: eq(user.email, recoveryEmail),
      });

      if (!recoveryUser) {
        throw new Error("Recovery user not found.");
      }

      testRecoveryCodes.delete(input.code);

      return {
        headers: buildTestRecoveryHeaders(recoveryUser.id),
        redirectTo: input.redirectTo,
      };
    }

    const { client, responseHeaders } = createSupabaseServerClientForRequest(
      input.request,
    );
    const { error } = await client.auth.exchangeCodeForSession(input.code);

    if (error) {
      throw error;
    }

    return {
      headers: responseHeaders,
      redirectTo: input.redirectTo,
    };
  },

  async updatePasswordForRecovery(input: {
    newPassword: string;
    request: Request;
  }) {
    if (isTestAccessAuthMode()) {
      const recoveryUserId = readTestRecoveryUserId(input.request);

      if (!recoveryUserId) {
        throw new Error("Recovery session missing.");
      }

      await db.transaction(async (tx) => {
        await tx
          .update(accessCredential)
          .set({
            passwordHash: createLocalAccessPasswordHash(input.newPassword),
          })
          .where(eq(accessCredential.userId, recoveryUserId));

        await tx
          .delete(accessSession)
          .where(eq(accessSession.userId, recoveryUserId));
      });

      return {
        headers: buildTestRecoveryHeaders(null),
      };
    }

    const { client, responseHeaders } = createSupabaseServerClientForRequest(
      input.request,
    );
    const { error } = await client.auth.updateUser({
      password: input.newPassword,
    });

    if (error) {
      throw error;
    }

    return {
      headers: responseHeaders,
    };
  },

  async confirmEmailOtp(input: {
    request: Request;
    tokenHash: string;
    type: "signup";
  }) {
    const { client, responseHeaders } = createSupabaseServerClientForRequest(
      input.request,
    );
    const { data, error } = await client.auth.verifyOtp({
      token_hash: input.tokenHash,
      type: input.type,
    });

    if (error || !data.user?.id || !data.user.email) {
      throw error ?? new Error("Supabase email confirmation failed.");
    }

    return {
      headers: responseHeaders,
      userId: await findOrCreateAppUserForAccessUser(data.user),
    };
  },
};

function isTestAccessAuthMode() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function isMissingSupabaseRefreshTokenError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "refresh_token_not_found"
  );
}

function mergeTestHeaders(...headerSets: Headers[]) {
  const mergedHeaders = new Headers();

  for (const headerSet of headerSets) {
    for (const [name, value] of headerSet) {
      mergedHeaders.append(name, value);
    }
  }

  return mergedHeaders;
}

async function signInTestCredentialUser(
  input: CredentialUserInput,
): Promise<AccessCredentialUser> {
  const result = await signInLocalAccessUser({
    email: input.email,
    password: input.password,
  });

  return {
    userId: result.response.user.id,
    headers: result.headers,
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
  const result = await createLocalAccessUser({
    email: input.email,
    name: input.email,
    password: input.password,
  });

  return {
    userId: result.response.user.id,
    headers: result.headers,
  };
}

async function startTestEmailSignUp(input: EmailSignUpInput) {
  await createLocalAccessUser({
    email: input.email,
    name: input.email,
    password: input.password,
  });

  return {
    headers: new Headers(),
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

async function startSupabaseEmailSignUp(input: EmailSignUpInput) {
  const { client, responseHeaders } = createSupabaseServerClientForRequest(
    input.request,
  );
  const { error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        name: input.email,
      },
      emailRedirectTo: input.redirectTo,
    },
  });

  if (error) {
    throw error;
  }

  return {
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

  const savedSession = await readLocalAccessSession(request.headers);

  if (!savedSession) {
    return null;
  }

  return {
    session: {
      id: savedSession.session.id,
      issuedAt: savedSession.session.issuedAt,
    },
    user: {
      email: savedSession.user.email,
      id: savedSession.user.id,
    },
  };
}

function buildTestRecoveryHeaders(userId: string | null) {
  const headers = new Headers();

  headers.append(
    "set-cookie",
    serialize(
      TEST_SUPABASE_RECOVERY_COOKIE_NAME,
      signTestRecoveryUserId(userId),
      {
        httpOnly: true,
        maxAge: userId ? undefined : 0,
        path: "/",
        sameSite: "lax",
      },
    ),
  );

  return headers;
}

function readTestSupabaseSessionToken(request: Request) {
  const cookies = parse(request.headers.get("cookie") ?? "");
  const signedToken = cookies[TEST_ACCESS_SESSION_COOKIE_NAME];

  if (signedToken) {
    return verifySignedTestSupabaseSessionToken(signedToken);
  }
  return null;
}

function readTestRecoveryUserId(request: Request) {
  const cookies = parse(request.headers.get("cookie") ?? "");
  const signedUserId = cookies[TEST_SUPABASE_RECOVERY_COOKIE_NAME];

  if (!signedUserId) {
    return null;
  }

  return verifySignedTestRecoveryUserId(signedUserId);
}

function signTestSupabaseSessionToken(sessionToken: string | null) {
  return signTestCookieValue(sessionToken);
}

function verifySignedTestSupabaseSessionToken(signedToken: string) {
  return verifySignedTestCookieValue(signedToken);
}

function signTestRecoveryUserId(userId: string | null) {
  return signTestCookieValue(userId);
}

function verifySignedTestRecoveryUserId(signedUserId: string) {
  return verifySignedTestCookieValue(signedUserId);
}

function signTestCookieValue(value: string | null) {
  if (!value) {
    return "";
  }

  return `${value}.${signTestSupabaseSession(value)}`;
}

function verifySignedTestCookieValue(signedValue: string) {
  const separatorIndex = signedValue.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const value = signedValue.slice(0, separatorIndex);
  const signature = signedValue.slice(separatorIndex + 1);
  const expectedSignature = signTestSupabaseSession(value);

  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  return value;
}

function getTestAccessAuthSecret() {
  return process.env.TEST_ACCESS_AUTH_SECRET ?? "test-access-auth-secret";
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

function getIssuedAtForAccessToken(accessToken: string | null) {
  if (!accessToken) {
    return null;
  }

  const payload = accessToken.split(".")[1];

  if (!payload) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(normalizeBase64Url(payload), "base64").toString("utf8"),
    ) as { iat?: number };

    if (typeof decoded.iat !== "number") {
      return null;
    }

    return new Date(decoded.iat * 1000);
  } catch {
    return null;
  }
}

function normalizeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = normalized.length % 4;

  return padding === 0 ? normalized : `${normalized}${"=".repeat(4 - padding)}`;
}

async function findOrCreateAppUserForAccessUser(input: {
  email?: string | null;
  id: string;
}) {
  if (!input.email) {
    return input.id;
  }

  const existingUserId = await findAppUserIdForAccessUser(input);

  if (existingUserId) {
    return existingUserId;
  }

  await db.insert(user).values({
    email: input.email,
    emailVerified: true,
    id: input.id,
    name: input.email,
  });

  return input.id;
}

async function findAppUserIdForAccessUser(input: {
  email?: string | null;
  id: string;
}) {
  if (!input.email) {
    return null;
  }

  const existingUser = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, input.email),
  });

  return existingUser?.id ?? null;
}

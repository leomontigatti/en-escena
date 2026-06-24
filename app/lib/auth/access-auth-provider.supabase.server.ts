import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import {
  createSupabaseServerClientForRequest,
  getRequiredSupabaseEnv,
} from "@/lib/auth/supabase-auth-ssr.server";

import type {
  AccessAuthProvider,
  AccessCredentialUser,
  AccessSession,
  CredentialUserInput,
  EmailOtpConfirmationInput,
  EmailSignUpInput,
  EmailSignUpResult,
  VerifiedAccessIdentity,
} from "@/lib/auth/access-auth-provider.shared.server";

export function createSupabaseAccessAuthProvider(): AccessAuthProvider {
  return {
    async getAccessSession(request: Request): Promise<AccessSession | null> {
      const verifiedIdentity =
        await readSupabaseVerifiedAccessIdentity(request);

      if (!verifiedIdentity) {
        return null;
      }

      const appUserId = await findAppUserIdForAccessUser({
        email: verifiedIdentity.user.email,
        id: verifiedIdentity.user.id,
      });

      return {
        session: verifiedIdentity.session,
        user: {
          id: appUserId ?? verifiedIdentity.user.id,
          email: verifiedIdentity.user.email,
        },
      };
    },

    async getVerifiedAccessIdentity(
      request: Request,
    ): Promise<VerifiedAccessIdentity | null> {
      return await readSupabaseVerifiedAccessIdentity(request);
    },

    async signInCredentialUser(
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
    },

    async signOutCurrentSession(request: Request) {
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
    },

    async startEmailSignUp(
      input: EmailSignUpInput,
    ): Promise<EmailSignUpResult> {
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
    },

    async deleteAccessUser(userId: string) {
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

    async verifyPasswordRecoveryOtp(input) {
      const { client, responseHeaders } = createSupabaseServerClientForRequest(
        input.request,
      );
      const { error } = await client.auth.verifyOtp({
        token_hash: input.tokenHash,
        type: "recovery",
      });

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

    async confirmEmailOtp(input: EmailOtpConfirmationInput) {
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
        userId: data.user.id,
      };
    },
  };
}

function isMissingSupabaseRefreshTokenError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "refresh_token_not_found"
  );
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

async function readSupabaseVerifiedAccessIdentity(
  request: Request,
): Promise<VerifiedAccessIdentity | null> {
  const { client, responseHeaders } =
    createSupabaseServerClientForRequest(request);
  let verifiedUser: { email?: string | null; id?: string | null } | null;

  try {
    const {
      data: { user: currentUser },
    } = await client.auth.getUser();

    verifiedUser = currentUser;
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

  return {
    headers: responseHeaders,
    session: {
      id: session?.access_token ?? null,
      issuedAt: getIssuedAtForAccessToken(session?.access_token ?? null),
    },
    user: {
      email: verifiedUser.email,
      id: verifiedUser.id,
    },
  };
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

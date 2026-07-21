import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { parse, serialize } from "cookie";

import { db } from "@/db";
import { account, accessSession, user } from "@/db/schema";
import {
  buildLocalAccessSessionHeaders,
  CREDENTIAL_PROVIDER_ID,
  createLocalAccessPasswordHash,
  createLocalAccessUser,
  readLocalAccessSession,
  signInLocalAccessUser,
  TEST_ACCESS_SESSION_COOKIE_NAME,
} from "@/lib/auth/access-test-auth.server";

import type {
  AccessAuthProvider,
  AccessCredentialUser,
  AccessSession,
  CredentialUserInput,
  EmailOtpConfirmationInput,
  EmailSignUpInput,
  EmailSignUpResult,
  HeadersResult,
  PasswordRecoveryCodeInput,
  PasswordRecoveryRedirectResult,
  PasswordRecoveryOtpInput,
  PasswordRecoveryUpdateInput,
  PasswordResetRequestInput,
  PasswordResetRequestResult,
  VerifiedAccessIdentity,
} from "@/lib/auth/access-auth-provider.shared.server";

type PendingTestEmailSignUp = {
  email: string;
  password: string;
};

const TEST_SUPABASE_RECOVERY_COOKIE_NAME = "sb-recovery-user";
const testRecoveryCodes = new Map<string, string>();
const pendingTestEmailSignUps = new Map<string, PendingTestEmailSignUp>();

export function createLocalTestAccessAuthProvider(): AccessAuthProvider {
  return {
    async getAccessSession(request: Request): Promise<AccessSession | null> {
      const verifiedIdentity = await readTestVerifiedAccessIdentity(request);

      if (!verifiedIdentity) {
        return null;
      }

      return {
        session: verifiedIdentity.session,
        user: verifiedIdentity.user,
      };
    },

    async getVerifiedAccessIdentity(
      request: Request,
    ): Promise<VerifiedAccessIdentity | null> {
      return await readTestVerifiedAccessIdentity(request);
    },

    async signInCredentialUser(
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
    },

    async signOutCurrentSession(request: Request): Promise<HeadersResult> {
      const sessionToken = readTestSupabaseSessionToken(request);

      if (sessionToken) {
        await db
          .delete(accessSession)
          .where(eq(accessSession.token, sessionToken));
      }

      return {
        headers: mergeHeaders(
          buildLocalAccessSessionHeaders(null),
          buildTestRecoveryHeaders(null),
        ),
      };
    },

    async signUpCredentialUser(
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
    },

    async startEmailSignUp(
      input: EmailSignUpInput,
    ): Promise<EmailSignUpResult> {
      const tokenHash = crypto.randomUUID();

      pendingTestEmailSignUps.set(tokenHash, {
        email: input.email,
        password: input.password,
      });

      return {
        headers: new Headers(),
        debugConfirmationTokenHash: tokenHash,
      };
    },

    async deleteAccessUser(userId: string): Promise<void> {
      await db.delete(accessSession).where(eq(accessSession.userId, userId));
      await db.delete(user).where(eq(user.id, userId));
    },

    async requestPasswordReset(
      input: PasswordResetRequestInput,
    ): Promise<PasswordResetRequestResult> {
      const recoveryCode = crypto.randomUUID();

      testRecoveryCodes.set(recoveryCode, input.email);

      return {
        headers: new Headers(),
        debugRecoveryCode: recoveryCode,
      };
    },

    async exchangePasswordRecoveryCode(
      input: PasswordRecoveryCodeInput,
    ): Promise<PasswordRecoveryRedirectResult> {
      return await exchangeTestPasswordRecoveryCode(input);
    },

    async verifyPasswordRecoveryOtp(
      input: PasswordRecoveryOtpInput,
    ): Promise<PasswordRecoveryRedirectResult> {
      return await exchangeTestPasswordRecoveryCode({
        code: input.tokenHash,
        request: input.request,
        redirectTo: input.redirectTo,
      });
    },

    async updatePasswordForRecovery(
      input: PasswordRecoveryUpdateInput,
    ): Promise<HeadersResult> {
      const recoveryUserId = readTestRecoveryUserId(input.request);

      if (!recoveryUserId) {
        throw new Error("Recovery session missing.");
      }

      await db.transaction(async (tx) => {
        await tx
          .update(account)
          .set({
            password: createLocalAccessPasswordHash(input.newPassword),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(account.userId, recoveryUserId),
              eq(account.providerId, CREDENTIAL_PROVIDER_ID),
            ),
          );

        await tx
          .delete(accessSession)
          .where(eq(accessSession.userId, recoveryUserId));
      });

      return {
        headers: buildTestRecoveryHeaders(null),
      };
    },

    async confirmEmailOtp(input: EmailOtpConfirmationInput) {
      const pendingSignUp = pendingTestEmailSignUps.get(input.tokenHash);

      if (!pendingSignUp) {
        throw new Error("Supabase email confirmation failed.");
      }

      pendingTestEmailSignUps.delete(input.tokenHash);

      const result = await createLocalAccessUser({
        email: pendingSignUp.email,
        name: pendingSignUp.email,
        password: pendingSignUp.password,
      });

      await db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, result.user.id));

      return {
        headers: result.headers,
        userId: result.user.id,
      };
    },
  };
}

async function exchangeTestPasswordRecoveryCode(
  input: PasswordRecoveryCodeInput,
): Promise<PasswordRecoveryRedirectResult> {
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

function mergeHeaders(...headerSets: Headers[]) {
  const mergedHeaders = new Headers();

  for (const headerSet of headerSets) {
    for (const [name, value] of headerSet) {
      mergedHeaders.append(name, value);
    }
  }

  return mergedHeaders;
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
    return verifySignedTestCookieValue(signedToken);
  }

  return null;
}

function readTestRecoveryUserId(request: Request) {
  const cookies = parse(request.headers.get("cookie") ?? "");
  const signedUserId = cookies[TEST_SUPABASE_RECOVERY_COOKIE_NAME];

  if (!signedUserId) {
    return null;
  }

  return verifySignedTestCookieValue(signedUserId);
}

function signTestRecoveryUserId(userId: string | null) {
  return signTestCookieValue(userId);
}

function signTestCookieValue(value: string | null) {
  if (!value) {
    return "";
  }

  return `${value}.${signTestCookieSignature(value)}`;
}

function verifySignedTestCookieValue(signedValue: string) {
  const separatorIndex = signedValue.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const value = signedValue.slice(0, separatorIndex);
  const signature = signedValue.slice(separatorIndex + 1);
  const expectedSignature = signTestCookieSignature(value);

  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  return value;
}

async function readTestVerifiedAccessIdentity(
  request: Request,
): Promise<VerifiedAccessIdentity | null> {
  const sessionToken = readTestSupabaseSessionToken(request);

  if (!sessionToken) {
    return null;
  }

  const savedSession = await readLocalAccessSession(request.headers);

  if (!savedSession) {
    return null;
  }

  return {
    headers: new Headers(),
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

function signTestCookieSignature(value: string) {
  return createHmac("sha256", getTestAccessAuthSecret())
    .update(value)
    .digest("hex");
}

function getTestAccessAuthSecret() {
  return process.env.TEST_ACCESS_AUTH_SECRET ?? "test-access-auth-secret";
}

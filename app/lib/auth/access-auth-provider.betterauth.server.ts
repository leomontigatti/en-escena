import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  symmetricDecrypt,
  symmetricEncrypt,
  verifyPassword,
} from "better-auth/crypto";
import { admin } from "better-auth/plugins";
import { and, desc, eq } from "drizzle-orm";
import { parse, serialize } from "cookie";

import { db } from "@/db";
import { account, accessSession, user, verification } from "@/db/schema";
import {
  buildAccessRecoveryLink,
  buildAcademySignUpConfirmationLink,
  sendAccessRecoveryEmail,
  sendAcademySignUpConfirmationEmail,
} from "@/lib/auth/access-auth-emails.server";

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

// Domain session policy (#297): 8 h lifetime, refreshed every 30 min. The
// domain gates (`suspended`, `sessionInvalidBefore` vs `issuedAt`,
// `requiresPasswordChange`) still live in `internal-access.server.ts`.
export const SESSION_EXPIRES_IN_SECONDS = 8 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 30 * 60;

// Better Auth provider: `betterAuth()` + `drizzleAdapter` mapping the canonical
// models onto our `en_escena_*` tables (`session` → `en_escena_access_session`).
// Better Auth's native scrypt hashing; `advanced.database.generateId: "uuid"`
// so IDs are generated with `gen_random_uuid()` in Postgres (research #364).
//
// `admin` plugin mounted (#423): enables `createUser`/`setUserPassword`/
// `banUser`/`unbanUser`/`removeUser` for the internal-user lifecycle
// (`internal-user-auth.server.ts`). The `banned` state maps onto the domain's
// `suspended` column (the same notion); `defaultRole` is a valid role from the
// enum (`academy`) because `createUser` writes it before internal-user sign-up
// reassigns the real role. `sendResetPassword` sends the real recovery email in
// Spanish (Resend, #424); the token also lands in the `verification` table,
// where tests read it without depending on delivery.
export const auth = betterAuth({
  appName: "En Escena",
  secret: getBetterAuthSecret(),
  baseURL: getBetterAuthBaseUrl(),
  basePath: "/api/auth",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session: accessSession,
      account,
      verification,
    },
  }),
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  emailAndPassword: {
    enabled: true,
    // Also verifies the legacy hashes migrated from `access_credential` (#433,
    // format `scrypt:<salt>:<hash>`). Better Auth verifies with its own scrypt
    // encoding, so without this the migrated credentials would never validate
    // and would silently push a reset onto those users. For Better Auth's own
    // native format it delegates to its verifier.
    password: {
      verify: verifyAccessPassword,
    },
    // Real recovery email delivery (Resend, in Spanish). `url` carries the
    // `callbackURL` (`/cambiar-contrasena`); the link carries `?code=<token>`,
    // which that page's loader exchanges for the recovery session. The token
    // also lives in `verification`, so tests read it without email.
    sendResetPassword: async ({ user: resetUser, url, token }) => {
      await sendAccessRecoveryEmail({
        to: resetUser.email,
        recoveryUrl: buildAccessRecoveryLink({
          resetUrl: url,
          fallbackBaseUrl: getBetterAuthBaseUrl(),
          token,
        }),
      });
    },
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  plugins: [
    admin({
      defaultRole: "academy",
      schema: {
        user: {
          fields: {
            // The admin plugin's ban IS the domain's suspension.
            banned: "suspended",
          },
        },
      },
    }),
  ],
});

// The server-side surface the loaders need. The remaining flows (sign-in/up,
// recovery) are covered by the Better Auth client (`access-auth-client`)
// against the `/api/auth/*` catch-all.
export async function getBetterAuthAccessSession(
  request: Request,
): Promise<AccessSession | null> {
  const result = await auth.api.getSession({ headers: request.headers });

  if (!result) {
    return null;
  }

  return {
    session: {
      id: result.session.id,
      issuedAt: result.session.createdAt ?? null,
    },
    user: {
      email: result.user.email,
      id: result.user.id,
    },
  };
}

export async function getBetterAuthVerifiedAccessIdentity(
  request: Request,
): Promise<VerifiedAccessIdentity | null> {
  const { headers, response } = await auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });

  if (!response) {
    return null;
  }

  return {
    headers,
    session: {
      id: response.session.id,
      issuedAt: response.session.createdAt ?? null,
    },
    user: {
      email: response.user.email,
      id: response.user.id,
    },
  };
}

const RESET_PASSWORD_IDENTIFIER_PREFIX = "reset-password:";

// The most recent password-reset token for a user. Better Auth stores the token
// in `verification` as `identifier = "reset-password:<token>"` with
// `value = userId`; tests (and debug flows) read it from there instead of
// depending on email delivery (which lands in #424).
export async function readLatestBetterAuthResetToken(
  userId: string,
): Promise<string | null> {
  const row = await db.query.verification.findFirst({
    columns: { identifier: true },
    orderBy: [desc(verification.createdAt)],
    where: eq(verification.value, userId),
  });

  if (!row?.identifier.startsWith(RESET_PASSWORD_IDENTIFIER_PREFIX)) {
    return null;
  }

  return row.identifier.slice(RESET_PASSWORD_IDENTIFIER_PREFIX.length);
}

// Better Auth's `provider_id` for local credentials (email + password).
export const CREDENTIAL_PROVIDER_ID = "credential";

// Better Auth's native scrypt hasher (`auth.$context.password`). Returns the
// hash in the format Better Auth verifies at sign-in, so a user created with
// these helpers can authenticate with `auth.api.signInEmail`.
export async function hashBetterAuthPassword(
  password: string,
): Promise<string> {
  const ctx = await auth.$context;
  return ctx.password.hash(password);
}

// Creates or updates a user's email+password credential, hashing with Better
// Auth. Replaces `upsertLocalAccessPassword` from the retired test provider
// (#422); used by internal-user sign-up and by invitations.
export async function upsertBetterAuthCredentialPassword(input: {
  password: string;
  userId: string;
}): Promise<void> {
  const passwordHash = await hashBetterAuthPassword(input.password);
  const existingCredential = await db.query.account.findFirst({
    columns: { id: true },
    where: and(
      eq(account.userId, input.userId),
      eq(account.providerId, CREDENTIAL_PROVIDER_ID),
    ),
  });

  if (existingCredential?.id) {
    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(account.id, existingCredential.id));
    return;
  }

  await db.insert(account).values({
    accountId: input.userId,
    providerId: CREDENTIAL_PROVIDER_ID,
    password: passwordHash,
    userId: input.userId,
  });
}

// Verifies an email+password credential against the stored hash, using Better
// Auth's verifier. Replaces `verifyLocalAccessPassword` (#422).
export async function verifyBetterAuthCredentialPassword(input: {
  email: string;
  password: string;
}): Promise<boolean> {
  const savedUser = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, input.email),
  });

  if (!savedUser?.id) {
    return false;
  }

  const savedCredential = await db.query.account.findFirst({
    columns: { password: true },
    where: and(
      eq(account.userId, savedUser.id),
      eq(account.providerId, CREDENTIAL_PROVIDER_ID),
    ),
  });

  if (!savedCredential?.password) {
    return false;
  }

  const ctx = await auth.$context;
  return ctx.password.verify({
    hash: savedCredential.password,
    password: input.password,
  });
}

// Signed cookie that carries the Better Auth reset token between the code
// exchange (`exchangePasswordRecoveryCode`) and the password change
// (`updatePasswordForRecovery`). Replaces the Supabase provider's
// `sb-recovery-user` cookie while keeping the same contract for the
// `/cambiar-contrasena` route.
const RECOVERY_TOKEN_COOKIE_NAME = "en_escena.recovery_token";

// Public academy sign-up is an app-owned flow (ADR-0001): user creation is
// deferred until email confirmation. Better Auth creates the user immediately
// in `signUpEmail`, so we store the pending sign-up and only materialize the
// user in `confirmEmailOtp`. The real emails land in #424; here the
// confirmation token is returned as `debug*` for the tests.
//
// The pending sign-up is persisted in the `verification` table (not in process
// memory): the confirmation arrives minutes or hours later, so a redeploy, a
// restart or a second instance must not lose it. The password is encrypted with
// the app secret (`symmetricEncrypt`), never at rest in the clear, and the row
// expires after 24 h.
type PendingEmailSignUp = {
  email: string;
  password: string;
};
const PENDING_SIGNUP_IDENTIFIER_PREFIX = "academy-signup:";
const PENDING_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;

// Adapter exposing Better Auth through the `AccessAuthProvider` interface the
// domain's routes and loaders use. Replaces our own test provider: the tests
// run real Better Auth against in-process PGlite (#422).
export function createBetterAuthAccessAuthProvider(): AccessAuthProvider {
  return {
    getAccessSession(request: Request): Promise<AccessSession | null> {
      return getBetterAuthAccessSession(request);
    },

    getVerifiedAccessIdentity(
      request: Request,
    ): Promise<VerifiedAccessIdentity | null> {
      return getBetterAuthVerifiedAccessIdentity(request);
    },

    async signInCredentialUser(
      input: CredentialUserInput,
    ): Promise<AccessCredentialUser> {
      const { headers, response } = await auth.api.signInEmail({
        body: { email: input.email, password: input.password },
        returnHeaders: true,
      });

      return { headers, userId: response.user.id };
    },

    async signOutCurrentSession(request: Request): Promise<HeadersResult> {
      const { headers } = await auth.api.signOut({
        headers: request.headers,
        returnHeaders: true,
      });

      headers.append("set-cookie", buildRecoveryTokenCookie(null));

      return { headers };
    },

    async signUpCredentialUser(
      input: CredentialUserInput,
    ): Promise<AccessCredentialUser> {
      const { headers, response } = await createBetterAuthCredentialUser({
        email: input.email,
        password: input.password,
      });

      return { headers, userId: response.user.id };
    },

    async startEmailSignUp(
      input: EmailSignUpInput,
    ): Promise<EmailSignUpResult> {
      const tokenHash = crypto.randomUUID();

      const encryptedPassword = await symmetricEncrypt({
        key: getBetterAuthSecret(),
        data: input.password,
      });

      await db.insert(verification).values({
        identifier: `${PENDING_SIGNUP_IDENTIFIER_PREFIX}${tokenHash}`,
        value: JSON.stringify({
          email: input.email,
          password: encryptedPassword,
        }),
        expiresAt: new Date(Date.now() + PENDING_SIGNUP_TTL_MS),
      });

      // App-owned public sign-up (ADR-0001): the user is materialized only in
      // `confirmEmailOtp`. We send the confirmation email in Spanish (Resend)
      // with the link to `/registro/confirmar?token_hash=...&type=signup`.
      await sendAcademySignUpConfirmationEmail({
        to: input.email,
        confirmationUrl: buildAcademySignUpConfirmationLink({
          redirectTo: input.redirectTo,
          tokenHash,
        }),
      });

      return {
        debugConfirmationTokenHash: tokenHash,
        headers: new Headers(),
      };
    },

    async confirmEmailOtp(input: EmailOtpConfirmationInput) {
      const pendingSignUp = await consumePendingEmailSignUp(input.tokenHash);

      if (!pendingSignUp) {
        throw new Error("Email confirmation failed.");
      }

      const { headers, response } = await createBetterAuthCredentialUser({
        email: pendingSignUp.email,
        password: pendingSignUp.password,
      });

      await db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, response.user.id));

      return { headers, userId: response.user.id };
    },

    async deleteAccessUser(userId: string): Promise<void> {
      await db.delete(accessSession).where(eq(accessSession.userId, userId));
      await db.delete(account).where(eq(account.userId, userId));
      await db.delete(user).where(eq(user.id, userId));
    },

    async requestPasswordReset(
      input: PasswordResetRequestInput,
    ): Promise<PasswordResetRequestResult> {
      await auth.api.requestPasswordReset({
        body: { email: input.email, redirectTo: input.redirectTo },
      });

      const targetUser = await db.query.user.findFirst({
        columns: { id: true },
        where: eq(user.email, input.email),
      });
      const debugRecoveryCode = targetUser
        ? await readLatestBetterAuthResetToken(targetUser.id)
        : null;

      return {
        headers: new Headers(),
        ...(debugRecoveryCode ? { debugRecoveryCode } : {}),
      };
    },

    async exchangePasswordRecoveryCode(
      input: PasswordRecoveryCodeInput,
    ): Promise<PasswordRecoveryRedirectResult> {
      return await beginBetterAuthPasswordRecovery({
        redirectTo: input.redirectTo,
        token: input.code,
      });
    },

    async verifyPasswordRecoveryOtp(
      input: PasswordRecoveryOtpInput,
    ): Promise<PasswordRecoveryRedirectResult> {
      return await beginBetterAuthPasswordRecovery({
        redirectTo: input.redirectTo,
        token: input.tokenHash,
      });
    },

    async updatePasswordForRecovery(
      input: PasswordRecoveryUpdateInput,
    ): Promise<HeadersResult> {
      const token = readRecoveryTokenCookie(input.request);

      if (!token) {
        throw new Error("Recovery session missing.");
      }

      const recoveryUserId = await readBetterAuthResetTokenUserId(token);

      await auth.api.resetPassword({
        body: { newPassword: input.newPassword, token },
      });

      if (recoveryUserId) {
        // The reset invalidates the credential; we revoke every active session
        // of the user to force a fresh login (domain policy, #297).
        await db
          .delete(accessSession)
          .where(eq(accessSession.userId, recoveryUserId));
      }

      const headers = new Headers();
      headers.append("set-cookie", buildRecoveryTokenCookie(null));

      return { headers };
    },
  };
}

// Reads and consumes (deletes) the pending sign-up persisted in `verification`.
// Returns null if the token does not exist, has already expired, or its payload
// cannot be decrypted (e.g. a secret rotation between sign-up and confirmation).
// The row is deleted whenever it exists — valid or not — so that no sign-up is
// left dangling.
async function consumePendingEmailSignUp(
  tokenHash: string,
): Promise<PendingEmailSignUp | null> {
  const identifier = `${PENDING_SIGNUP_IDENTIFIER_PREFIX}${tokenHash}`;
  const row = await db.query.verification.findFirst({
    columns: { id: true, value: true, expiresAt: true },
    where: eq(verification.identifier, identifier),
  });

  if (!row) {
    return null;
  }

  await db.delete(verification).where(eq(verification.id, row.id));

  if (row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.value) as {
      email: string;
      password: string;
    };
    const password = await symmetricDecrypt({
      key: getBetterAuthSecret(),
      data: parsed.password,
    });

    return { email: parsed.email, password };
  } catch {
    return null;
  }
}

async function createBetterAuthCredentialUser(input: {
  email: string;
  password: string;
}) {
  return auth.api.signUpEmail({
    body: { email: input.email, name: input.email, password: input.password },
    returnHeaders: true,
  });
}

async function beginBetterAuthPasswordRecovery(input: {
  redirectTo: string;
  token: string;
}): Promise<PasswordRecoveryRedirectResult> {
  const recoveryUserId = await readBetterAuthResetTokenUserId(input.token);

  if (!recoveryUserId) {
    throw new Error("Invalid recovery code.");
  }

  const headers = new Headers();
  headers.append("set-cookie", buildRecoveryTokenCookie(input.token));

  return { headers, redirectTo: input.redirectTo };
}

// The `userId` associated with a valid reset token. Better Auth stores the token
// in `verification` as `identifier = "reset-password:<token>"`, `value = userId`.
async function readBetterAuthResetTokenUserId(
  token: string,
): Promise<string | null> {
  const row = await db.query.verification.findFirst({
    columns: { value: true },
    where: eq(
      verification.identifier,
      `${RESET_PASSWORD_IDENTIFIER_PREFIX}${token}`,
    ),
  });

  return row?.value ?? null;
}

function buildRecoveryTokenCookie(token: string | null) {
  return serialize(
    RECOVERY_TOKEN_COOKIE_NAME,
    token ? signRecoveryToken(token) : "",
    {
      httpOnly: true,
      maxAge: token ? undefined : 0,
      path: "/",
      sameSite: "lax",
    },
  );
}

function readRecoveryTokenCookie(request: Request): string | null {
  const cookies = parse(request.headers.get("cookie") ?? "");
  const signedToken = cookies[RECOVERY_TOKEN_COOKIE_NAME];

  if (!signedToken) {
    return null;
  }

  return verifySignedRecoveryToken(signedToken);
}

function signRecoveryToken(token: string) {
  return `${token}.${createRecoveryTokenSignature(token)}`;
}

function verifySignedRecoveryToken(signedToken: string): string | null {
  const separatorIndex = signedToken.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const token = signedToken.slice(0, separatorIndex);
  const signature = signedToken.slice(separatorIndex + 1);
  const expectedSignature = createRecoveryTokenSignature(token);

  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  return token;
}

function createRecoveryTokenSignature(token: string) {
  return createHmac("sha256", getBetterAuthSecret())
    .update(token)
    .digest("hex");
}

// scrypt key length of the legacy `scrypt:<salt>:<hash>` format that
// `createLocalAccessPasswordHash` used (retired in #422): `scryptSync` with
// Node's default parameters and `keylen = 64`, salt in hex.
const LEGACY_SCRYPT_KEY_LENGTH = 64;

// Verifies a password against the stored hash. Detects the legacy format
// migrated from `access_credential` (`scrypt:<salt>:<hash>`) and verifies it
// with the old algorithm; for Better Auth's native format it delegates to its
// verifier (`better-auth/crypto`). This is the config's `password.verify`, so
// `verifyBetterAuthCredentialPassword` uses it too, via `ctx.password`.
function verifyAccessPassword(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (isLegacyScryptHash(input.hash)) {
    return Promise.resolve(verifyLegacyScryptHash(input));
  }

  return verifyPassword({ hash: input.hash, password: input.password });
}

// The legacy format is `scrypt:<salt>:<hash>` (3 segments, the first `"scrypt"`);
// Better Auth's native one is `<salt>:<hash>` (2 segments), without the prefix.
function isLegacyScryptHash(hash: string): boolean {
  const segments = hash.split(":");
  return segments.length === 3 && segments[0] === "scrypt";
}

function verifyLegacyScryptHash(input: {
  hash: string;
  password: string;
}): boolean {
  const [, salt, expectedHash] = input.hash.split(":");

  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(input.password, salt, LEGACY_SCRYPT_KEY_LENGTH);
  const expectedHashBuffer = Buffer.from(expectedHash, "hex");

  return (
    actualHash.length === expectedHashBuffer.length &&
    timingSafeEqual(actualHash, expectedHashBuffer)
  );
}

// Better Auth secret (session signing + recovery-token HMAC). Fails closed in
// production: if `BETTER_AUTH_SECRET` is missing, throw instead of falling back
// to a hardcoded public secret (which would allow forging recovery tokens). In
// dev/test the fallback is kept so the env var is not required.
function getBetterAuthSecret() {
  const secret =
    process.env.BETTER_AUTH_SECRET ?? process.env.TEST_ACCESS_AUTH_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET is required in production for session signing and recovery-token HMAC.",
    );
  }

  return "development-better-auth-secret-development-better-auth-secret";
}

function getBetterAuthBaseUrl() {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.APP_URL ??
    "http://localhost:5173"
  );
}

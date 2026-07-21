import { createHmac, timingSafeEqual } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { desc, eq } from "drizzle-orm";
import { parse, serialize } from "cookie";

import { db } from "@/db";
import { account, accessSession, user, verification } from "@/db/schema";

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

// Política de sesión del dominio (#297): 8 h de vida, refresco cada 30 min. Los
// gates de dominio (`suspended`, `sessionInvalidBefore` vs `issuedAt`,
// `requiresPasswordChange`) siguen en `internal-access.server.ts`.
export const SESSION_EXPIRES_IN_SECONDS = 8 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 30 * 60;

// Provider Better Auth: `betterAuth()` + `drizzleAdapter` mapeando los modelos
// canónicos a nuestras tablas `en_escena_*` (`session` → `en_escena_access_session`).
// Hashing scrypt nativo de Better Auth; `advanced.database.generateId: "uuid"`
// para que los IDs se generen con `gen_random_uuid()` en Postgres (research #364).
//
// El plugin `admin` del server (y sus columnas de baneo) llega en #423; acá solo
// se monta el credential provider + sesiones. Los emails reales (Resend, en
// español) llegan en #424: por ahora las callbacks son no-op y los tokens de
// verificación/reset se leen de la tabla `verification` para los tests.
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
    // #424 reemplaza esto por el envío real vía Resend. El token queda en la
    // tabla `verification`; `readLatestBetterAuthVerificationValue` lo expone.
    sendResetPassword: async () => {},
  },
  emailVerification: {
    // #424: envío real. Ídem: el token vive en `verification`.
    sendVerificationEmail: async () => {},
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
});

// Lado server-side que necesitan los loaders. El resto de los flujos
// (sign-in/up, recovery) los cubre el client de Better Auth (`access-auth-client`)
// contra el catch-all `/api/auth/*`.
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

// Token de reset de contraseña más reciente de un usuario. Better Auth guarda el
// token en `verification` como `identifier = "reset-password:<token>"` con
// `value = userId`; los tests (y flujos de debug) lo leen de ahí en vez de
// depender del envío de email (que llega en #424).
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

// Cookie firmada que transporta el token de reset de Better Auth entre el
// intercambio del código (`exchangePasswordRecoveryCode`) y el cambio de
// contraseña (`updatePasswordForRecovery`). Reemplaza la cookie `sb-recovery-user`
// del provider de Supabase manteniendo el mismo contrato de la ruta
// `/cambiar-contrasena`.
const RECOVERY_TOKEN_COOKIE_NAME = "en_escena.recovery_token";

// El alta pública de academias es un flujo app-owned (ADR-0001): la creación del
// usuario se difiere hasta la confirmación por email. Better Auth crea el usuario
// de inmediato en `signUpEmail`, así que guardamos el alta pendiente en memoria y
// recién materializamos el usuario en `confirmEmailOtp`. Los emails reales llegan
// en #424; acá el token de confirmación se devuelve como `debug*` para los tests.
type PendingEmailSignUp = {
  email: string;
  password: string;
};
const pendingEmailSignUps = new Map<string, PendingEmailSignUp>();

// Adapter que expone Better Auth con la interfaz `AccessAuthProvider` que usan
// las rutas y loaders del dominio. Reemplaza el provider de test propio: los
// tests corren Better Auth real contra PGlite in-process (#422).
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

      pendingEmailSignUps.set(tokenHash, {
        email: input.email,
        password: input.password,
      });

      return {
        debugConfirmationTokenHash: tokenHash,
        headers: new Headers(),
      };
    },

    async confirmEmailOtp(input: EmailOtpConfirmationInput) {
      const pendingSignUp = pendingEmailSignUps.get(input.tokenHash);

      if (!pendingSignUp) {
        throw new Error("Email confirmation failed.");
      }

      pendingEmailSignUps.delete(input.tokenHash);

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
        // El reset invalida la credencial; revocamos toda sesión activa del
        // usuario para forzar un nuevo login (política del dominio, #297).
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

// `userId` asociado a un token de reset vigente. Better Auth guarda el token en
// `verification` como `identifier = "reset-password:<token>"` con `value = userId`.
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

function getBetterAuthSecret() {
  return (
    process.env.BETTER_AUTH_SECRET ??
    process.env.TEST_ACCESS_AUTH_SECRET ??
    "development-better-auth-secret-development-better-auth-secret"
  );
}

function getBetterAuthBaseUrl() {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.APP_URL ??
    "http://localhost:5173"
  );
}

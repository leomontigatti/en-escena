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
// Plugin `admin` montado (#423): habilita `createUser`/`setUserPassword`/
// `banUser`/`unbanUser`/`removeUser` para el ciclo de vida de los internos
// (`internal-user-auth.server.ts`). El estado `banned` se mapea a la columna
// `suspended` del dominio (misma noción); `defaultRole` es un rol válido del
// enum (`academy`) porque `createUser` lo escribe antes de que el alta de
// internos re-asigne el rol real. `sendResetPassword` envía el email real de
// recuperación en español (Resend, #424); el token también queda en la tabla
// `verification`, de donde los tests lo leen sin depender del envío.
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
    // Verifica también los hashes legacy migrados de `access_credential` (#433,
    // formato `scrypt:<salt>:<hash>`). Better Auth verifica con su propio encoding
    // scrypt, así que sin esto las credenciales migradas nunca validarían y
    // empujarían un reset silencioso a esos usuarios. Para el formato nativo de
    // Better Auth delega en su verificador.
    password: {
      verify: verifyAccessPassword,
    },
    // Envío real del email de recuperación (Resend, en español). `url` trae el
    // `callbackURL` (`/cambiar-contrasena`); el link lleva `?code=<token>`, que
    // el loader de esa página intercambia por la sesión de recuperación. El
    // token también vive en `verification`, así los tests lo leen sin email.
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
            // El baneo del admin plugin ES la suspensión del dominio.
            banned: "suspended",
          },
        },
      },
    }),
  ],
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

// `provider_id` de Better Auth para credenciales locales (email + contraseña).
export const CREDENTIAL_PROVIDER_ID = "credential";

// Hasher scrypt nativo de Better Auth (`auth.$context.password`). Devuelve el hash
// en el formato que Better Auth verifica al iniciar sesión, así el usuario creado
// con estos helpers puede autenticarse con `auth.api.signInEmail`.
export async function hashBetterAuthPassword(
  password: string,
): Promise<string> {
  const ctx = await auth.$context;
  return ctx.password.hash(password);
}

// Crea o actualiza la credencial email+contraseña de un usuario, hasheando con
// Better Auth. Reemplaza a `upsertLocalAccessPassword` del provider de test
// retirado (#422); lo usan el alta de internos y la invitación.
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

// Verifica una credencial email+contraseña contra el hash guardado, usando el
// verificador de Better Auth. Reemplaza a `verifyLocalAccessPassword` (#422).
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

// Cookie firmada que transporta el token de reset de Better Auth entre el
// intercambio del código (`exchangePasswordRecoveryCode`) y el cambio de
// contraseña (`updatePasswordForRecovery`). Reemplaza la cookie `sb-recovery-user`
// del provider de Supabase manteniendo el mismo contrato de la ruta
// `/cambiar-contrasena`.
const RECOVERY_TOKEN_COOKIE_NAME = "en_escena.recovery_token";

// El alta pública de academias es un flujo app-owned (ADR-0001): la creación del
// usuario se difiere hasta la confirmación por email. Better Auth crea el usuario
// de inmediato en `signUpEmail`, así que guardamos el alta pendiente y recién
// materializamos el usuario en `confirmEmailOtp`. Los emails reales llegan en #424;
// acá el token de confirmación se devuelve como `debug*` para los tests.
//
// El alta pendiente se persiste en la tabla `verification` (no en memoria del
// proceso): la confirmación llega minutos u horas después, así que un redeploy,
// un restart o una segunda instancia no deben perderla. El password va cifrado
// con el secret de la app (`symmetricEncrypt`), nunca en claro en reposo, y la
// fila expira a las 24 h.
type PendingEmailSignUp = {
  email: string;
  password: string;
};
const PENDING_SIGNUP_IDENTIFIER_PREFIX = "academy-signup:";
const PENDING_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;

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

      // Alta pública app-owned (ADR-0001): el usuario se materializa recién en
      // `confirmEmailOtp`. Enviamos el email de confirmación en español (Resend)
      // con el link a `/registro/confirmar?token_hash=...&type=signup`.
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

// Lee y consume (borra) el alta pendiente persistida en `verification`. Devuelve
// null si el token no existe, ya expiró, o su payload no se puede descifrar
// (p.ej. rotación del secret entre el alta y la confirmación). La fila se borra
// siempre que exista —válida o no— para no dejar altas colgadas.
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

// Longitud de clave scrypt del formato legacy `scrypt:<salt>:<hash>` que usaba
// `createLocalAccessPasswordHash` (retirado en #422): `scryptSync` con los
// parámetros por defecto de Node y `keylen = 64`, salt en hex.
const LEGACY_SCRYPT_KEY_LENGTH = 64;

// Verifica un password contra el hash guardado. Detecta el formato legacy
// migrado de `access_credential` (`scrypt:<salt>:<hash>`) y lo verifica con el
// algoritmo viejo; para el formato nativo de Better Auth delega en su
// verificador (`better-auth/crypto`). Es el `password.verify` de la config, así
// que también lo usa `verifyBetterAuthCredentialPassword` vía `ctx.password`.
function verifyAccessPassword(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (isLegacyScryptHash(input.hash)) {
    return Promise.resolve(verifyLegacyScryptHash(input));
  }

  return verifyPassword({ hash: input.hash, password: input.password });
}

// El formato legacy es `scrypt:<salt>:<hash>` (3 segmentos, primero `"scrypt"`);
// el nativo de Better Auth es `<salt>:<hash>` (2 segmentos), sin el prefijo.
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

// Secret de Better Auth (firma de sesión + HMAC del token de recuperación).
// Falla cerrado en producción: si falta `BETTER_AUTH_SECRET`, tirar en vez de
// caer a un secret público hardcodeado (que permitiría forjar tokens de
// recuperación). En dev/test se mantiene el fallback para no exigir la env.
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

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { account, accessSession, user, verification } from "@/db/schema";

import type {
  AccessSession,
  VerifiedAccessIdentity,
} from "@/lib/auth/access-auth-provider.shared.server";

// Política de sesión del dominio (#297): 8 h de vida, refresco cada 30 min. Los
// gates de dominio (`suspended`, `sessionInvalidBefore` vs `issuedAt`,
// `requiresPasswordChange`) siguen en `internal-access.server.ts`.
const SESSION_EXPIRES_IN_SECONDS = 8 * 60 * 60;
const SESSION_UPDATE_AGE_SECONDS = 30 * 60;

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

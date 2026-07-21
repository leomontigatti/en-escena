import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { accessSession } from "@/db/schema";
import {
  auth,
  verifyBetterAuthCredentialPassword,
} from "@/lib/auth/access-auth-provider.betterauth.server";

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
  userId: string;
  currentSessionId: string;
};

// Alta server-side de un interno vía el admin plugin de Better Auth (#423). Sin
// sesión: `createUser` corre en el servidor con el email ya confirmado
// (`data.emailVerified`, parity con el `email_confirm: true` de Supabase). El
// rol real lo asigna el alta de internos (`internal-user-create.server.ts`); acá
// queda el `defaultRole` del plugin.
export async function createInternalCredentialUser(
  input: InternalCredentialUserInput,
) {
  const { user } = await auth.api.createUser({
    body: {
      email: input.email,
      name: input.name,
      password: input.password,
      data: { emailVerified: true },
    },
  });

  return { userId: user.id };
}

// Rollback del alta de internos: borra el usuario (y sus sesiones/cuentas por
// cascada de FK) usando el `internalAdapter` del contexto de Better Auth. No hay
// sesión de admin en el camino de rollback, así que no pasa por `removeUser`.
export async function deleteInternalCredentialUser(userId: string) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUser(userId);
}

// Reset de contraseña desde el panel: `setUserPassword` del admin plugin con los
// `headers` de la sesión del admin, que Better Auth exige para autorizar la
// operación (research #369). El cambio de contraseña propio (obligatorio) no
// pasa por acá: usa `upsertBetterAuthCredentialPassword` directo.
export async function setInternalCredentialPassword(
  input: InternalCredentialPasswordInput,
  adminHeaders: Headers,
) {
  await auth.api.setUserPassword({
    body: {
      newPassword: input.password,
      userId: input.userId,
    },
    headers: adminHeaders,
  });
}

export async function verifyInternalCredentialPassword(
  input: VerifyInternalCredentialPasswordInput,
) {
  return verifyBetterAuthCredentialPassword(input);
}

export async function revokeInternalCredentialSessions(userId: string) {
  await db.delete(accessSession).where(eq(accessSession.userId, userId));
}

export async function revokeOtherAccessSessions(
  input: RevokeOtherAccessSessionsInput,
) {
  await db
    .delete(accessSession)
    .where(
      and(
        eq(accessSession.userId, input.userId),
        ne(accessSession.id, input.currentSessionId),
      ),
    );
}

// Suspensión (= `banned` de Better Auth) desde el panel: `banUser`/`unbanUser`
// del admin plugin con los `headers` de la sesión del admin. `banUser` marca la
// columna `suspended` y revoca las sesiones del interno; `unbanUser` la limpia.
export async function setInternalCredentialSuspendedState(
  input: {
    suspended: boolean;
    userId: string;
  },
  adminHeaders: Headers,
) {
  if (input.suspended) {
    await auth.api.banUser({
      body: { userId: input.userId },
      headers: adminHeaders,
    });
    return;
  }

  await auth.api.unbanUser({
    body: { userId: input.userId },
    headers: adminHeaders,
  });
}

import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { internalInvitationTokens, user } from "@/db/schema";
import {
  createRegistrationToken,
  hashRegistrationToken,
  normalizeEmail,
} from "@/lib/academy-registration-token.server";
import { auth } from "@/lib/auth.server";
import { sendEmail as sendAppEmail } from "@/lib/email.server";
import {
  isInternalInvitationRole,
  type InternalInvitationRole,
} from "@/lib/internal-invitation.shared";

const INTERNAL_INVITATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type CreateInternalInvitationDependencies = {
  createToken: () => string;
  sendEmail: typeof sendAppEmail;
};

const defaultCreateInternalInvitationDependencies = {
  createToken: createRegistrationToken,
  sendEmail: sendAppEmail,
} satisfies CreateInternalInvitationDependencies;

function activeInternalInvitationWhere(token: string, now: Date) {
  return and(
    eq(internalInvitationTokens.tokenHash, hashRegistrationToken(token)),
    isNull(internalInvitationTokens.consumedAt),
    gt(internalInvitationTokens.expiresAt, now),
  );
}

export async function createInternalInvitation(
  input: {
    email: string;
    role: InternalInvitationRole;
    invitedByUserId: string;
    requestUrl: string;
  },
  dependencies: CreateInternalInvitationDependencies = defaultCreateInternalInvitationDependencies,
) {
  const inviter = await db.query.user.findFirst({
    columns: { role: true },
    where: eq(user.id, input.invitedByUserId),
  });

  if (inviter?.role !== "admin") {
    return {
      ok: false as const,
      error: "Solo administración puede invitar usuarios internos.",
    };
  }

  const email = normalizeEmail(input.email);
  const existingUser = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });

  if (existingUser) {
    return {
      ok: false as const,
      error: "Ese correo ya tiene un usuario en En Escena.",
    };
  }

  const token = dependencies.createToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INTERNAL_INVITATION_TOKEN_TTL_MS);

  await db.transaction(async (tx) => {
    await tx
      .update(internalInvitationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(internalInvitationTokens.email, email),
          isNull(internalInvitationTokens.consumedAt),
        ),
      );

    await tx.insert(internalInvitationTokens).values({
      email,
      role: input.role,
      tokenHash: hashRegistrationToken(token),
      expiresAt,
    });
  });

  const invitationUrl = new URL(`/invitacion/${token}`, input.requestUrl);

  await dependencies.sendEmail({
    to: email,
    subject: "Definí tu acceso interno a En Escena",
    text: `Usá este enlace dentro de las próximas 24 horas para definir tu contraseña: ${invitationUrl.toString()}`,
  });

  return { ok: true as const };
}

export async function getInternalInvitationStatus(token: string) {
  const invitation = await db.query.internalInvitationTokens.findFirst({
    columns: { id: true },
    where: activeInternalInvitationWhere(token, new Date()),
  });

  return invitation ? "valid" : "invalid";
}

export async function acceptInternalInvitation(input: {
  token: string;
  password: string;
  request: Request;
}) {
  const now = new Date();
  const invitation = await db.query.internalInvitationTokens.findFirst({
    where: activeInternalInvitationWhere(input.token, now),
  });

  if (!invitation || !isInternalInvitationRole(invitation.role)) {
    return { ok: false as const, error: "El enlace no es válido o expiró." };
  }

  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: invitation.email,
      name: invitation.email,
      password: input.password,
      rememberMe: true,
    },
    headers: input.request.headers,
    returnHeaders: true,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({
        emailVerified: true,
        role: invitation.role,
      })
      .where(eq(user.id, signUpResult.response.user.id));

    await tx
      .update(internalInvitationTokens)
      .set({ consumedAt: now })
      .where(eq(internalInvitationTokens.id, invitation.id));
  });

  return { ok: true as const, headers: signUpResult.headers };
}

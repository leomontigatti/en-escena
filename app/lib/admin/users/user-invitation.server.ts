import { and, eq, gt, isNull } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db } from "@/db";
import { account, internalUserInvitations, user } from "@/db/schema";
import {
  createRegistrationToken,
  hashRegistrationToken,
  normalizeEmail,
} from "@/lib/academies/registration-token.server";
import {
  accessAuthProvider,
  type AccessCredentialUser,
} from "@/lib/auth/access-auth-provider.server";
import { sendEmail, type SendEmailInput } from "@/lib/shared/email.server";
import {
  INTERNAL_USER_ROLES,
  type InternalUserRole,
} from "@/lib/auth/internal-user-roles";

const INTERNAL_INVITATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const INVALID_INVITATION_ERROR = "El enlace no es válido o expiró.";
const ACADEMY_USER_INVITATION_ERROR =
  "Esta invitación no puede activar un usuario de academia.";

export type InternalInvitationTokenStatus = "valid" | "invalid";

type RequestInternalUserInvitationInput = {
  email: string;
  role: InternalUserRole;
  requestUrl: string;
};

type CompleteInternalUserInvitationInput = {
  token: string;
  password: string;
  request: Request;
};

type InternalUserInvitationDependencies = {
  sendEmail?: (input: SendEmailInput) => Promise<void> | void;
};

type CredentialUserCreator = (input: {
  email: string;
  password: string;
  request: Request;
  existingUserId?: string;
}) => Promise<AccessCredentialUser>;

export async function requestInternalUserInvitation(
  input: RequestInternalUserInvitationInput,
  dependencies: InternalUserInvitationDependencies = {},
) {
  const email = normalizeEmail(input.email);
  assertInternalUserRole(input.role);
  const token = createRegistrationToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INTERNAL_INVITATION_TOKEN_TTL_MS);

  await db.transaction(async (tx) => {
    await tx
      .update(internalUserInvitations)
      .set({ consumedAt: now })
      .where(
        and(
          eq(internalUserInvitations.email, email),
          isNull(internalUserInvitations.consumedAt),
        ),
      );

    await tx.insert(internalUserInvitations).values({
      email,
      role: input.role,
      tokenHash: hashRegistrationToken(token),
      expiresAt,
    });
  });

  const invitationUrl = new URL(`/invitacion/${token}`, input.requestUrl);
  const deliverEmail = dependencies.sendEmail ?? sendEmail;

  await deliverEmail({
    to: email,
    subject: "Te invitaron a En Escena",
    text: `Usá este enlace dentro de las próximas 24 horas para confirmar tu correo y definir tu contraseña: ${invitationUrl.toString()}`,
  });
}

function assertInternalUserRole(
  role: string,
): asserts role is InternalUserRole {
  if (!INTERNAL_USER_ROLES.includes(role as InternalUserRole)) {
    throw new Error("La invitación interna no puede asignar academia.");
  }
}

export async function getInternalInvitationTokenStatus(token: string) {
  const invitation = await findUsableInternalInvitation(token, new Date(), {
    id: true,
  });

  return invitation ? "valid" : "invalid";
}

export async function completeInternalUserInvitation(
  input: CompleteInternalUserInvitationInput,
  dependencies: {
    createCredentialUser?: CredentialUserCreator;
  } = {},
) {
  const now = new Date();
  const invitation = await findUsableInternalInvitation(input.token, now);

  if (!invitation) {
    return { ok: false as const, error: INVALID_INVITATION_ERROR };
  }

  const existingUser = await db.query.user.findFirst({
    columns: { id: true, role: true },
    where: eq(user.email, invitation.email),
  });

  if (existingUser?.role === "academy") {
    return {
      ok: false as const,
      error: ACADEMY_USER_INVITATION_ERROR,
    };
  }

  const createCredentialUser =
    dependencies.createCredentialUser ?? createBetterAuthCredentialUser;
  const credentialUser = await createCredentialUser({
    email: invitation.email,
    password: input.password,
    request: input.request,
    existingUserId: existingUser?.id,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({
        emailVerified: true,
        role: invitation.role,
      })
      .where(eq(user.id, credentialUser.userId));

    await tx
      .update(internalUserInvitations)
      .set({ consumedAt: now })
      .where(eq(internalUserInvitations.id, invitation.id));
  });

  return {
    ok: true as const,
    headers: credentialUser.headers,
    userId: credentialUser.userId,
  };
}

function findUsableInternalInvitation(
  token: string,
  now: Date,
  columns?: { id: true },
) {
  return db.query.internalUserInvitations.findFirst({
    columns,
    where: and(
      eq(internalUserInvitations.tokenHash, hashRegistrationToken(token)),
      isNull(internalUserInvitations.consumedAt),
      gt(internalUserInvitations.expiresAt, now),
    ),
  });
}

async function createBetterAuthCredentialUser(input: {
  email: string;
  password: string;
  request: Request;
  existingUserId?: string;
}) {
  if (input.existingUserId) {
    await setExistingUserPassword(input.existingUserId, input.password);

    return accessAuthProvider.signInCredentialUser({
      email: input.email,
      password: input.password,
      request: input.request,
    });
  }

  return accessAuthProvider.signUpCredentialUser({
    email: input.email,
    password: input.password,
    request: input.request,
  });
}

async function setExistingUserPassword(userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  const credentialAccount = await db.query.account.findFirst({
    columns: { id: true },
    where: and(
      eq(account.userId, userId),
      eq(account.providerId, "credential"),
    ),
  });

  if (credentialAccount) {
    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(account.id, credentialAccount.id));
    return;
  }

  await db.insert(account).values({
    userId,
    providerId: "credential",
    accountId: userId,
    password: passwordHash,
  });
}

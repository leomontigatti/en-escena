import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { academies, academyRegistrationTokens, user } from "@/db/schema";
import {
  deleteAcademyUserAccess,
  signUpAcademyUser,
} from "@/lib/academies/registration-auth.server";
import {
  createRegistrationToken,
  hashRegistrationToken,
  normalizeEmail,
} from "@/lib/academies/registration-token.server";
import { sendEmail } from "@/lib/shared/email.server";
import { toTitleCase } from "@/lib/shared/text-normalization";

const REGISTRATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const REGISTRATION_EMAIL_CONFLICT_ERROR =
  "Ese correo ya tiene un usuario en En Escena.";
const REGISTRATION_GENERIC_ERROR =
  "No pudimos completar el registro. Intentá nuevamente.";

export type RegistrationTokenStatus = "valid" | "invalid";

export async function requestAcademyRegistrationEmail(input: {
  email: string;
  requestUrl: string;
}) {
  const email = normalizeEmail(input.email);
  const existingUser = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });

  if (existingUser) {
    await sendEmail({
      to: email,
      subject: "Ya tenés acceso a En Escena",
      text: "Ese correo ya tiene un usuario en En Escena. Ingresá desde /ingresar o usá /recuperar-acceso si no recordás tu contraseña.",
    });
    return;
  }

  const token = createRegistrationToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REGISTRATION_TOKEN_TTL_MS);

  await db.transaction(async (tx) => {
    await tx
      .update(academyRegistrationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(academyRegistrationTokens.email, email),
          isNull(academyRegistrationTokens.consumedAt),
        ),
      );

    await tx.insert(academyRegistrationTokens).values({
      email,
      tokenHash: hashRegistrationToken(token),
      expiresAt,
    });
  });

  const registrationUrl = new URL(`/registro/${token}`, input.requestUrl);

  await sendEmail({
    to: email,
    subject: "Completá tu registro en En Escena",
    text: `Usá este enlace dentro de las próximas 24 horas para registrar tu academia: ${registrationUrl.toString()}`,
  });
}

export async function getRegistrationTokenStatus(token: string) {
  const registrationToken = await db.query.academyRegistrationTokens.findFirst({
    columns: { id: true },
    where: and(
      eq(academyRegistrationTokens.tokenHash, hashRegistrationToken(token)),
      isNull(academyRegistrationTokens.consumedAt),
      gt(academyRegistrationTokens.expiresAt, new Date()),
    ),
  });

  return registrationToken ? "valid" : "invalid";
}

export async function completeAcademyRegistration(input: {
  token: string;
  academyName: string;
  contactName: string;
  phone: string;
  password: string;
  request: Request;
}) {
  const tokenHash = hashRegistrationToken(input.token);
  const now = new Date();
  const registrationToken = await db.query.academyRegistrationTokens.findFirst({
    where: and(
      eq(academyRegistrationTokens.tokenHash, tokenHash),
      isNull(academyRegistrationTokens.consumedAt),
      gt(academyRegistrationTokens.expiresAt, now),
    ),
  });

  if (!registrationToken) {
    return { ok: false as const, error: "El enlace no es válido o expiró." };
  }

  const signUpResult = await signUpAcademyUser({
    email: registrationToken.email,
    password: input.password,
    request: input.request,
  }).catch((error: unknown) => {
    if (isRegistrationEmailConflict(error)) {
      return null;
    }

    throw error;
  });

  if (!signUpResult) {
    return {
      ok: false as const,
      error: REGISTRATION_EMAIL_CONFLICT_ERROR,
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(user)
        .values({
          id: signUpResult.userId,
          name: registrationToken.email,
          email: registrationToken.email,
          emailVerified: true,
          role: "academy",
        })
        .onConflictDoUpdate({
          target: user.id,
          set: {
            email: registrationToken.email,
            emailVerified: true,
            name: registrationToken.email,
            role: "academy",
            updatedAt: new Date(),
          },
        });

      await tx.insert(academies).values({
        userId: signUpResult.userId,
        name: toTitleCase(input.academyName),
        contactName: toTitleCase(input.contactName),
        phone: input.phone.trim(),
      });

      await tx
        .update(academyRegistrationTokens)
        .set({ consumedAt: now })
        .where(eq(academyRegistrationTokens.id, registrationToken.id));
    });
  } catch (error) {
    await deleteAcademyUserAccess(signUpResult.userId);

    return {
      ok: false as const,
      error: isRegistrationEmailConflict(error)
        ? REGISTRATION_EMAIL_CONFLICT_ERROR
        : REGISTRATION_GENERIC_ERROR,
    };
  }

  return { ok: true as const, headers: signUpResult.headers };
}

function isRegistrationEmailConflict(error: unknown): boolean {
  const authCode = readErrorProperty(error, "code");

  if (
    authCode === "conflict" ||
    authCode === "email_exists" ||
    authCode === "user_already_exists"
  ) {
    return true;
  }

  const dbCode = readErrorProperty(error, "code");
  const constraintName = readErrorProperty(error, "constraint_name");
  const detail = readErrorProperty(error, "detail");
  const message = readErrorProperty(error, "message");

  return (
    dbCode === "23505" &&
    (constraintName === "en_escena_user_email_unique" ||
      detail?.includes("(email)=") === true ||
      message?.includes("email") === true)
  );
}

function readErrorProperty(
  error: unknown,
  key: "code" | "constraint_name" | "detail" | "message" | "status",
) {
  let current: unknown = error;

  while (current && typeof current === "object") {
    const value =
      key in current && typeof current[key as keyof typeof current] !== "object"
        ? String(current[key as keyof typeof current])
        : null;

    if (value) {
      return value;
    }

    current =
      "cause" in current && current.cause && typeof current.cause === "object"
        ? current.cause
        : null;
  }

  return null;
}

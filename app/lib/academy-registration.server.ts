import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { academies, academyRegistrationTokens, user } from "@/db/schema";
import {
  createRegistrationToken,
  hashRegistrationToken,
  normalizeEmail,
} from "@/lib/academy-registration-token.server";
import { signUpAcademyUser } from "@/lib/academy-registration-auth.server";
import { sendEmail } from "@/lib/email.server";

const REGISTRATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

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
      text: "Ese correo ya tiene un usuario en En Escena. Ingresá desde /ingresar o usá la recuperación de acceso si no recordás tu contraseña.",
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
  });

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, signUpResult.userId));

    await tx.insert(academies).values({
      userId: signUpResult.userId,
      name: input.academyName.trim(),
      contactName: input.contactName.trim(),
      phone: input.phone.trim(),
    });

    await tx
      .update(academyRegistrationTokens)
      .set({ consumedAt: now })
      .where(eq(academyRegistrationTokens.id, registrationToken.id));
  });

  return { ok: true as const, headers: signUpResult.headers };
}

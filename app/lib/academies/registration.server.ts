import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { academies, academyRegistrationTokens, user } from "@/db/schema";
import {
  deleteAcademyUserAccess,
  signUpAcademyUser,
  startAcademyUserSignUp,
} from "@/lib/academies/registration-auth.server";
import { PUBLIC_REGISTRATION_CONFIRMATION_PATH } from "@/lib/auth/access-paths.shared";
import {
  createRegistrationToken,
  hashRegistrationToken,
  normalizeEmail,
} from "@/lib/academies/registration-token.server";
import {
  invalidArgentinePhoneMessage,
  isValidArgentinePhone,
} from "@/lib/shared/argentine-phone";
import { sendEmail } from "@/lib/shared/email.server";
import { toTitleCase } from "@/lib/shared/text-normalization";

const REGISTRATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const REGISTRATION_EMAIL_CONFLICT_ERROR =
  "Ese correo ya tiene un usuario en En Escena.";
const REGISTRATION_START_MESSAGE =
  "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.";
const REGISTRATION_GENERIC_ERROR =
  "No pudimos completar el registro. Intentá nuevamente.";

export type RegistrationTokenStatus = "valid" | "invalid";
type StartAcademyUserSignUp = typeof startAcademyUserSignUp;
type IsRegistrationEligible = (email: string) => Promise<boolean>;
type AcademyRegistrationStartResult = {
  headers: Headers;
  message: string;
};

export async function startAcademyRegistration(input: {
  email: string;
  password: string;
  requestUrl: string;
  request: Request;
  startAcademyUserSignUp?: StartAcademyUserSignUp;
  isRegistrationEligible?: IsRegistrationEligible;
}): Promise<AcademyRegistrationStartResult> {
  const email = normalizeEmail(input.email);
  const checkRegistrationEligibility =
    input.isRegistrationEligible ?? isEligibleAcademyRegistrationEmail;
  const canStartRegistration = await checkRegistrationEligibility(email);

  if (!canStartRegistration) {
    return createRegistrationStartResult();
  }

  try {
    const startSignUp = input.startAcademyUserSignUp ?? startAcademyUserSignUp;
    const result = await startSignUp({
      email,
      password: input.password,
      redirectTo: new URL(
        PUBLIC_REGISTRATION_CONFIRMATION_PATH,
        input.requestUrl,
      ).toString(),
      request: input.request,
    });

    return createRegistrationStartResult(result.headers);
  } catch (error) {
    if (isRegistrationEmailConflict(error)) {
      return createRegistrationStartResult();
    }

    throw error;
  }
}

function createRegistrationStartResult(
  headers = new Headers(),
): AcademyRegistrationStartResult {
  return {
    headers,
    message: REGISTRATION_START_MESSAGE,
  };
}

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
    subject: "Tu enlace para registrar la academia",
    text: [
      "Hola,",
      "",
      "Te dejamos el enlace para terminar el registro de tu academia en En Escena:",
      "",
      registrationUrl.toString(),
      "",
      "El enlace dura 24 horas y se puede usar una sola vez. Cuando ingreses, vas a poder cargar los datos de la academia y crear tu contraseña de acceso.",
      "",
      "Si no solicitaste este registro, no hace falta que hagas nada.",
      "",
      "El equipo de En Escena",
    ].join("\n"),
  });
}

async function isEligibleAcademyRegistrationEmail(email: string) {
  const existingUser = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });

  return existingUser === null;
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

  if (!isValidArgentinePhone(input.phone)) {
    return { ok: false as const, error: invalidArgentinePhoneMessage };
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
        phone: input.phone,
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

type ErrorPropertyKey = "code" | "constraint_name" | "detail" | "message";

function isRegistrationEmailConflict(error: unknown): boolean {
  const code = readErrorProperty(error, "code");

  if (
    code === "conflict" ||
    code === "email_exists" ||
    code === "user_already_exists"
  ) {
    return true;
  }

  const constraintName = readErrorProperty(error, "constraint_name");
  const detail = readErrorProperty(error, "detail");
  const message = readErrorProperty(error, "message");

  return (
    code === "23505" &&
    (constraintName === "en_escena_user_email_unique" ||
      detail?.includes("(email)=") === true ||
      message?.includes("email") === true)
  );
}

function readErrorProperty(error: unknown, key: ErrorPropertyKey) {
  let current: unknown = error;

  while (current && typeof current === "object") {
    if (key in current) {
      const propertyValue = current[key as keyof typeof current];

      if (propertyValue !== null && typeof propertyValue !== "object") {
        const stringValue = String(propertyValue);

        if (stringValue) {
          return stringValue;
        }
      }
    }

    const cause = "cause" in current ? current.cause : null;
    current = cause && typeof cause === "object" ? cause : null;
  }

  return null;
}

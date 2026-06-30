import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { startAcademyUserSignUp } from "@/lib/academies/registration-auth.server";
import { PUBLIC_REGISTRATION_CONFIRMATION_PATH } from "@/lib/auth/access-paths.shared";
import { readErrorProperty } from "@/lib/shared/error-properties.server";
import { normalizeEmail } from "@/lib/shared/email-normalization";

const REGISTRATION_START_MESSAGE =
  "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.";

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

async function isEligibleAcademyRegistrationEmail(email: string) {
  const existingUser = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });

  return !existingUser;
}

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

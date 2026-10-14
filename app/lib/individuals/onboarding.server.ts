import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, individuals, user } from "@/db/schema";
import { requirePendingOnboardingUser } from "@/lib/auth/pending-onboarding.server";
import {
  parseIndividualPersonalData,
  toIndividualFullName,
  type IndividualPersonalDataValues,
} from "@/lib/individuals/personal-data";
import {
  isUniqueViolation,
  readErrorProperty,
} from "@/lib/shared/error-properties.server";

const ONE_ACCOUNT_PER_EMAIL_MESSAGE =
  "Este correo ya tiene una cuenta en En Escena, y cada correo es una sola cuenta. Para abrir una cuenta de Particular, registrate con otro correo.";

/**
 * Opens an individual's account in one transaction: the user with the
 * `individual` permission (created when the identity has none yet), the owner
 * row of kind `individual` that holds its phone and, later, its money, and the
 * person (ADR-0019). Either all three exist afterwards or none does.
 */
export async function completeIndividualOnboarding(input: {
  request: Request;
  values: IndividualPersonalDataValues;
}) {
  const onboardingUser = await requirePendingOnboardingUser(input.request);
  const parsed = parseIndividualPersonalData(input.values);

  if (!parsed.ok) {
    return { ok: false as const, fieldErrors: parsed.fieldErrors };
  }

  const person = parsed.data;
  const fullName = toIndividualFullName(person);

  try {
    await db.transaction(async (tx) => {
      if (onboardingUser.existingUser) {
        await tx
          .update(user)
          .set({ role: "individual", updatedAt: new Date() })
          .where(eq(user.id, onboardingUser.user.id));
      } else {
        await tx.insert(user).values({
          email: onboardingUser.user.email,
          emailVerified: true,
          id: onboardingUser.user.id,
          name: onboardingUser.user.email,
          role: "individual",
        });
      }

      const [owner] = await tx
        .insert(academies)
        .values({
          userId: onboardingUser.user.id,
          kind: "individual",
          name: fullName,
          contactName: fullName,
          phone: person.phone,
          city: null,
          province: null,
        })
        .returning({ id: academies.id });

      await tx.insert(individuals).values({
        academyId: owner.id,
        firstName: person.firstName,
        lastName: person.lastName,
        documentType: person.documentType,
        documentNumber: person.documentNumber,
      });
    });
  } catch (error) {
    if (isAccountConflict(error)) {
      return { ok: false as const, error: ONE_ACCOUNT_PER_EMAIL_MESSAGE };
    }

    throw error;
  }

  return { headers: onboardingUser.headers, ok: true as const };
}

/** Another user already holds the email, or this one already owns a row. */
function isAccountConflict(error: unknown) {
  if (!isUniqueViolation(error)) {
    return false;
  }

  const constraintName = readErrorProperty(error, "constraint_name");
  const detail = readErrorProperty(error, "detail");

  return (
    constraintName === "en_escena_user_email_unique" ||
    constraintName === "academy_user_id_unique" ||
    detail?.includes("(email)=") === true ||
    detail?.includes("(user_id)=") === true
  );
}

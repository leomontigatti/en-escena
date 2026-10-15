import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, individuals, user } from "@/db/schema";
import { requirePendingOnboardingUser } from "@/lib/auth/pending-onboarding.server";
import {
  parseIndividualPersonalData,
  toIndividualFullName,
  type IndividualPersonalDataFieldErrors,
  type IndividualPersonalDataValues,
} from "@/lib/individuals/personal-data";
import {
  isUniqueViolation,
  readErrorProperty,
} from "@/lib/shared/error-properties.server";

export type IndividualOnboardingResult =
  | { headers: Headers; ok: true }
  | {
      fieldErrors: IndividualPersonalDataFieldErrors;
      ok: false;
      reason: "invalid";
    }
  /** Another user holds the email, or this one already owns another account. */
  | { ok: false; reason: "email-taken" };

/**
 * Opens an individual's account in one transaction: the user with the
 * `individual` permission (created when the identity has none yet), the owner
 * row of kind `individual` that holds its phone and, later, its money, and the
 * person (ADR-0019). Either all three exist afterwards or none does.
 *
 * A second submit that passed the guard before the first committed meets the
 * account the first opened, and succeeds with it rather than being refused.
 */
export async function completeIndividualOnboarding(input: {
  request: Request;
  values: IndividualPersonalDataValues;
}): Promise<IndividualOnboardingResult> {
  const onboardingUser = await requirePendingOnboardingUser(input.request);
  const parsed = parseIndividualPersonalData(input.values);

  if (!parsed.ok) {
    return { ok: false, reason: "invalid", fieldErrors: parsed.fieldErrors };
  }

  const headers = onboardingUser.headers;

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
    if (!isUniqueViolation(error)) {
      throw error;
    }

    if (await holdsIndividualAccount(onboardingUser.user.id)) {
      return { headers, ok: true };
    }

    if (isAccountConflict(error)) {
      return { ok: false, reason: "email-taken" };
    }

    throw error;
  }

  return { headers, ok: true };
}

async function holdsIndividualAccount(userId: string) {
  const [account] = await db
    .select({ id: individuals.id })
    .from(academies)
    .innerJoin(individuals, eq(individuals.academyId, academies.id))
    .innerJoin(user, eq(user.id, academies.userId))
    .where(and(eq(academies.userId, userId), eq(user.role, "individual")))
    .limit(1);

  return account !== undefined;
}

/** Another user already holds the email, or this one already owns a row. */
function isAccountConflict(error: unknown) {
  const constraintName = readErrorProperty(error, "constraint_name");
  const detail = readErrorProperty(error, "detail");

  return (
    constraintName === "en_escena_user_email_unique" ||
    constraintName === "academy_user_id_unique" ||
    detail?.includes("(email)=") === true ||
    detail?.includes("(user_id)=") === true
  );
}

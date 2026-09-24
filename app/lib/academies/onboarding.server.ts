import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { redirectToLoginForRequest } from "@/lib/auth/access-redirects.server";
import {
  invalidArgentinePhoneMessage,
  isValidArgentinePhone,
} from "@/lib/shared/argentine-phone";
import type {
  AcademyNameMatch,
  AcademyNameWarning,
} from "@/lib/academies/academy-name-duplicates";
import { matchesToWarnAbout } from "@/lib/shared/duplicate-warning";
import {
  isUniqueViolation,
  readErrorProperty,
} from "@/lib/shared/error-properties.server";
import { toTitleCase } from "@/lib/shared/text-normalization";
import { normalizedTextEquals } from "@/lib/shared/text-normalization.server";

const ACADEMY_ONBOARDING_CONFLICT_ERROR =
  "No pudimos completar el alta de la academia porque este acceso ya está asociado a otro usuario. Volvé a ingresar o contactanos.";

export async function requireAcademyOnboardingUser(request: Request) {
  const identity = await accessAuthProvider.getVerifiedAccessIdentity(request);

  if (!identity) {
    redirectToLoginForRequest(request);
  }

  const existingUser = await db.query.user.findFirst({
    columns: {
      id: true,
      role: true,
    },
    where: eq(user.id, identity.user.id),
  });

  if (existingUser && existingUser.role !== "academy") {
    throw redirect("/ingresar");
  }

  const academy = await db.query.academies.findFirst({
    columns: { id: true },
    where: eq(academies.userId, identity.user.id),
  });

  if (academy) {
    throw redirect("/portal");
  }

  return {
    existingUser,
    headers: identity.headers,
    user: identity.user,
  };
}

export async function completeAcademyOnboarding(input: {
  academyName: string;
  acknowledgedDuplicateIds: readonly string[];
  contactName: string;
  phone: string;
  request: Request;
}) {
  const onboardingUser = await requireAcademyOnboardingUser(input.request);

  if (!isValidArgentinePhone(input.phone)) {
    return { ok: false as const, error: invalidArgentinePhoneMessage };
  }

  const name = toTitleCase(input.academyName);
  const matchesToShow = matchesToWarnAbout(
    await findAcademiesNamed(name),
    input.acknowledgedDuplicateIds,
  );

  if (matchesToShow.length > 0) {
    const warning: AcademyNameWarning = {
      kind: "academy-name",
      matches: matchesToShow,
    };

    return { ok: false as const, warning };
  }

  try {
    await db.transaction(async (tx) => {
      if (!onboardingUser.existingUser) {
        await tx.insert(user).values({
          email: onboardingUser.user.email,
          emailVerified: true,
          id: onboardingUser.user.id,
          name: onboardingUser.user.email,
          role: "academy",
        });
      }

      await tx.insert(academies).values({
        userId: onboardingUser.user.id,
        name,
        contactName: toTitleCase(input.contactName),
        phone: input.phone,
      });
    });
  } catch (error) {
    if (isAcademyOnboardingConflict(error)) {
      return {
        ok: false as const,
        error: ACADEMY_ONBOARDING_CONFLICT_ERROR,
      };
    }

    throw error;
  }

  return { headers: onboardingUser.headers, ok: true as const };
}

/**
 * Only the name and the registration date of the other academy ever leave this
 * function: the check must not become a way to probe who is registered.
 */
async function findAcademiesNamed(name: string): Promise<AcademyNameMatch[]> {
  return await db
    .select({
      createdAt: academies.createdAt,
      id: academies.id,
      name: academies.name,
    })
    .from(academies)
    .where(normalizedTextEquals(academies.name, name))
    .orderBy(academies.createdAt);
}

function isAcademyOnboardingConflict(error: unknown) {
  if (!isUniqueViolation(error)) {
    return false;
  }

  const constraintName = readErrorProperty(error, "constraint_name");
  const detail = readErrorProperty(error, "detail");
  const message = readErrorProperty(error, "message");

  return (
    constraintName === "en_escena_user_email_unique" ||
    constraintName === "academy_user_id_unique" ||
    detail?.includes("(email)=") === true ||
    detail?.includes("(user_id)=") === true ||
    message?.includes("email") === true ||
    message?.includes("user_id") === true
  );
}

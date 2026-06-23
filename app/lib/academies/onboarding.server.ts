import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { requireSignedInUser } from "@/lib/auth/internal-access.server";
import {
  invalidArgentinePhoneMessage,
  isValidArgentinePhone,
} from "@/lib/shared/argentine-phone";
import { toTitleCase } from "@/lib/shared/text-normalization";

export async function requireAcademyOnboardingUser(request: Request) {
  const appUser = await requireSignedInUser(request);

  if (appUser.role !== "academy") {
    throw redirect("/ingresar");
  }

  const academy = await db.query.academies.findFirst({
    columns: { id: true },
    where: eq(academies.userId, appUser.id),
  });

  if (academy) {
    throw redirect("/portal");
  }

  return appUser;
}

export async function completeAcademyOnboarding(input: {
  academyName: string;
  contactName: string;
  phone: string;
  request: Request;
}) {
  const appUser = await requireAcademyOnboardingUser(input.request);

  if (!isValidArgentinePhone(input.phone)) {
    return { ok: false as const, error: invalidArgentinePhoneMessage };
  }

  await db.insert(academies).values({
    userId: appUser.id,
    name: toTitleCase(input.academyName),
    contactName: toTitleCase(input.contactName),
    phone: input.phone,
  });

  return { ok: true as const };
}

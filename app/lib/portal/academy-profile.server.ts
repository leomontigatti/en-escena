import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";

export type AcademyProfileInput = {
  name: string;
  contactName: string;
  phone: string;
};

export type AcademyProfileField = keyof AcademyProfileInput;

export type UpdateAcademyProfileResult =
  | { ok: true; academy: typeof academies.$inferSelect }
  | {
      ok: false;
      message: string;
      fieldErrors: Partial<Record<AcademyProfileField, string>>;
      values: AcademyProfileInput;
    };

const reviewAcademyProfileFieldsMessage = "Revisá los campos marcados.";
const requiredFieldMessage = "Este campo es obligatorio.";

export async function updateAcademyProfile(
  academyId: string,
  input: AcademyProfileInput,
): Promise<UpdateAcademyProfileResult> {
  const values = {
    name: input.name,
    contactName: input.contactName,
    phone: input.phone,
  };
  const normalizedValues = {
    name: input.name.trim(),
    contactName: input.contactName.trim(),
    phone: input.phone.trim(),
  };
  const fieldErrors = getAcademyProfileFieldErrors(normalizedValues);

  if (hasFieldErrors(fieldErrors)) {
    return {
      ok: false,
      message: reviewAcademyProfileFieldsMessage,
      fieldErrors,
      values,
    };
  }

  const [academy] = await db
    .update(academies)
    .set({
      ...normalizedValues,
      updatedAt: new Date(),
    })
    .where(eq(academies.id, academyId))
    .returning();

  if (!academy) {
    throw new Response("No encontramos esa Academia.", { status: 404 });
  }

  return { ok: true, academy };
}

function getAcademyProfileFieldErrors(input: AcademyProfileInput) {
  return {
    name: input.name ? undefined : requiredFieldMessage,
    contactName: input.contactName ? undefined : requiredFieldMessage,
    phone: input.phone ? undefined : requiredFieldMessage,
  } satisfies Partial<Record<AcademyProfileField, string>>;
}

function hasFieldErrors(fieldErrors: Partial<Record<string, string>>) {
  return Object.values(fieldErrors).some(Boolean);
}

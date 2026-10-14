import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, individuals } from "@/db/schema";
import {
  toIndividualFullName,
  type IndividualPersonalData,
} from "@/lib/individuals/personal-data";

/**
 * Saves an individual's personal data where each part lives: the person on its
 * `individual` row, the phone and the full name (as `name` and `contactName`)
 * on its owner row, together.
 */
export async function updateIndividualPersonalData(
  individual: { id: string; ownerId: string },
  data: IndividualPersonalData,
) {
  const fullName = toIndividualFullName(data);
  const updatedAt = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(individuals)
      .set({
        firstName: data.firstName,
        lastName: data.lastName,
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        updatedAt,
      })
      .where(eq(individuals.id, individual.id));
    await tx
      .update(academies)
      .set({
        name: fullName,
        contactName: fullName,
        phone: data.phone,
        updatedAt,
      })
      .where(eq(academies.id, individual.ownerId));
  });
}

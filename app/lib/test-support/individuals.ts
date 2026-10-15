import { db } from "@/db";
import { individuals } from "@/db/schema";
import type { IdentityDocumentType } from "@/lib/roster/identity-document";
import { createAcademyUser } from "@/lib/test-support/academies";

/**
 * A signed-in `Particular` as onboarding leaves it (ADR-0019): the user with
 * the `individual` permission, its owner row of kind `individual` and the
 * person, with the cookie a browser would send.
 */
export async function createIndividualUser(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  documentNumber?: string;
  documentType?: IdentityDocumentType;
  /** A stored document photo's key, which moves the link to `Pendiente`. */
  documentPhotoStorageKey?: string;
  phone?: string;
}) {
  const firstName = input.firstName ?? "Ana";
  const lastName = input.lastName ?? "Pérez";
  const fullName = `${firstName} ${lastName}`;
  const owner = await createAcademyUser({
    academyName: fullName,
    email: input.email,
    kind: "individual",
    phone: input.phone ?? "3511234567",
    role: "individual",
  });
  const [person] = await db
    .insert(individuals)
    .values({
      academyId: owner.academyId,
      firstName,
      lastName,
      documentType: input.documentType ?? "dni",
      documentNumber: input.documentNumber ?? "30123456",
      documentPhotoStorageKey: input.documentPhotoStorageKey ?? null,
    })
    .returning();

  return {
    cookie: owner.cookie,
    individualId: person.id,
    ownerId: owner.academyId,
    userId: owner.userId,
  };
}

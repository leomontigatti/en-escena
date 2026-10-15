import { db } from "@/db";
import { individuals } from "@/db/schema";
import { confirmIndividualLink } from "@/lib/individuals/link.server";
import type { IdentityDocumentType } from "@/lib/roster/identity-document";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";

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

/**
 * A `Particular` whose link administration confirmed (`Vinculado`): it reaches
 * every academy row carrying `documentNumber`.
 */
export async function createLinkedIndividualUser(
  input: Parameters<typeof createIndividualUser>[0],
) {
  const documentNumber = input.documentNumber ?? "30123456";
  const documentPhotoStorageKey =
    input.documentPhotoStorageKey ?? "individuals/photo.jpg";
  const individual = await createIndividualUser({
    ...input,
    documentNumber,
    documentPhotoStorageKey,
  });
  const admin = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
  });
  const confirmed = await confirmIndividualLink({
    confirmedByUserId: admin.userId,
    documentNumber,
    documentPhotoStorageKey,
    individualId: individual.individualId,
  });

  if (!confirmed.ok) {
    throw new Error(`Expected the link to be confirmed: ${confirmed.reason}`);
  }

  return individual;
}

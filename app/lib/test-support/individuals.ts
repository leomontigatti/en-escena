import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, individuals, user } from "@/db/schema";
import {
  createAccessRequestCookie,
  createAccessUser,
} from "@/lib/auth/access-auth.test-support";

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
  phone?: string;
}) {
  const firstName = input.firstName ?? "Ana";
  const lastName = input.lastName ?? "Pérez";
  const signUpResult = await createAccessUser({
    email: input.email,
    name: input.email,
    password: "password-segura",
  });
  const userId = signUpResult.response.user.id;

  await db
    .update(user)
    .set({ emailVerified: true, role: "individual" })
    .where(eq(user.id, userId));

  const [owner] = await db
    .insert(academies)
    .values({
      userId,
      kind: "individual",
      name: `${firstName} ${lastName}`,
      contactName: `${firstName} ${lastName}`,
      phone: input.phone ?? "3511234567",
    })
    .returning();
  const [person] = await db
    .insert(individuals)
    .values({
      academyId: owner.id,
      firstName,
      lastName,
      documentType: "dni",
      documentNumber: input.documentNumber ?? "30123456",
    })
    .returning();

  return {
    cookie: createAccessRequestCookie(signUpResult.headers),
    individualId: person.id,
    ownerId: owner.id,
    userId,
  };
}

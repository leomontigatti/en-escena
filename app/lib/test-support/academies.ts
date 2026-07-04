import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import {
  createLocalAccessRequestCookie,
  createLocalAccessUser,
} from "@/lib/auth/access-test-auth.server";

async function createAcademyUser(input: {
  academyName: string;
  contactName?: string;
  email: string;
  phone?: string;
  suspended?: boolean;
}) {
  const signUpResult = await createLocalAccessUser({
    email: input.email,
    name: input.email,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "academy",
      suspended: input.suspended ?? false,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signUpResult.response.user.id,
      name: input.academyName,
      contactName: input.contactName ?? input.academyName,
      phone: input.phone ?? "1111-1111",
    })
    .returning();

  return {
    academy,
    academyId: academy.id,
    cookie: createLocalAccessRequestCookie(signUpResult.headers),
    headers: signUpResult.headers,
    userId: signUpResult.response.user.id,
  };
}

export { createAcademyUser };

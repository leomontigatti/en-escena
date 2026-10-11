import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import {
  createAccessRequestCookie,
  createAccessUser,
} from "@/lib/auth/access-auth.test-support";
import type { InternalUserRole } from "@/lib/auth/internal-user-roles";

// A verified user with `role`, signed in, and a request that carries its
// cookies the way the browser would. `body` makes it a POST.
export async function createSignedInRequest(input: {
  email: string;
  role: "academy" | InternalUserRole;
  requestUrl?: string;
  body?: FormData;
  name?: string;
  internalUsername?: string;
  password?: string;
}) {
  const name = input.name ?? input.email;
  const signUpResult = await createAccessUser({
    email: input.email,
    name,
    password: input.password ?? "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: input.role,
      internalUsername: input.internalUsername ?? null,
      name,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const cookie = createAccessRequestCookie(signUpResult.headers);

  return {
    userId: signUpResult.response.user.id,
    cookie,
    request: new Request(input.requestUrl ?? "http://localhost/protected", {
      method: input.body ? "POST" : "GET",
      body: input.body,
      headers: { cookie },
    }),
  };
}

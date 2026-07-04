import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import {
  createLocalAccessRequestCookie,
  createLocalAccessUser,
} from "@/lib/auth/access-test-auth.server";
import { expectThrownResponse } from "@/lib/test-support/http";

type AdminTestRole = "academy" | "admin" | "auditor" | "judge";

async function createSignedInAdminRequest(input: {
  body?: FormData;
  email: string;
  requestUrl: string;
  role: AdminTestRole;
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
      role: input.role,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    request: new Request(input.requestUrl, {
      method: input.body ? "POST" : "GET",
      body: input.body,
      headers: {
        cookie: createLocalAccessRequestCookie(signUpResult.headers),
      },
    }),
  };
}

export { createSignedInAdminRequest, expectThrownResponse };

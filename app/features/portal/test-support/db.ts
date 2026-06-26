import { eq } from "drizzle-orm";
import { expect } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";

export async function createAcademySession({
  academyName,
  email,
  phone = "1112345678",
}: {
  academyName: string;
  email: string;
  phone?: string;
}) {
  const signUpResult = await createLocalAccessUser({
    email,
    name: email,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "academy",
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signUpResult.response.user.id,
      name: academyName,
      contactName: "Contacto",
      phone,
    })
    .returning();

  return {
    academyId: academy.id,
    cookie: createRequestCookie(signUpResult.headers),
  };
}

export async function createAcademyRecord({
  academyName,
  email,
  phone = "1112345678",
}: {
  academyName: string;
  email: string;
  phone?: string;
}) {
  const [record] = await db
    .insert(user)
    .values({
      email,
      name: email,
      emailVerified: true,
      role: "academy",
    })
    .returning();
  const [academy] = await db
    .insert(academies)
    .values({
      userId: record.id,
      name: academyName,
      contactName: "Contacto",
      phone,
    })
    .returning();

  return academy;
}

export function createPortalPostRequest(
  requestUrl: string,
  cookie: string,
  body: FormData,
) {
  return new Request(requestUrl, {
    method: "POST",
    headers: { cookie },
    body,
  });
}

export function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/sb-access-token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return `sb-access-token=${sessionCookie[1]}`;
}

export async function expectThrownResponse(
  promise: Promise<unknown>,
  expectedStatus?: number,
) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) {
      if (expectedStatus !== undefined) {
        expect(error.status).toBe(expectedStatus);
      }

      return error;
    }

    throw error;
  }

  throw new Error("Expected a Response to be thrown.");
}

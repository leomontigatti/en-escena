import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { account, accessSession } from "@/db/schema";
import { auth } from "@/lib/auth/access-auth-provider.betterauth.server";
import {
  createAccessRequestCookie,
  createAccessUser,
  createAccessUserWithPassword,
  signInAccessUser,
} from "@/lib/auth/access-auth.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`createAccessUser`", () => {
  test("signs a user in with a session Better Auth accepts, and no password", async () => {
    const created = await createAccessUser({
      email: "Sin.Clave@example.com",
      name: "Sin Clave",
    });

    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: createAccessRequestCookie(created.headers),
      }),
    });

    expect(session?.user.id).toBe(created.user.id);
    expect(session?.user.email).toBe("sin.clave@example.com");
    expect(session?.user.emailVerified).toBe(false);
    await expect(
      db.select().from(account).where(eq(account.userId, created.user.id)),
    ).resolves.toEqual([]);
    await expect(
      signInAccessUser({ email: created.user.email, password: "cualquiera" }),
    ).rejects.toThrow();
  });
});

describe("`createAccessUserWithPassword`", () => {
  test("creates a user who can sign in with that password", async () => {
    const created = await createAccessUserWithPassword({
      email: "con.clave@example.com",
      name: "Con Clave",
      password: "password-segura",
    });

    const signedIn = await signInAccessUser({
      email: created.user.email,
      password: "password-segura",
    });

    expect(signedIn.user.id).toBe(created.user.id);
    await expect(
      db
        .select({ userId: accessSession.userId })
        .from(accessSession)
        .where(eq(accessSession.userId, created.user.id)),
    ).resolves.toHaveLength(2);
  });
});

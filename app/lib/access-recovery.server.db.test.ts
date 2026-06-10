import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, user, verification } from "@/db/schema";
import { auth } from "@/lib/auth.server";
import {
  requestAccessRecoveryEmail,
  resetAccessPassword,
} from "@/lib/access-recovery.server";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("access recovery", () => {
  test("lets an existing user define a new password without creating academy data or changing role", async () => {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: "usuario@example.com",
        name: "Usuario",
        password: "old-password",
      },
    });

    await db
      .update(user)
      .set({ emailVerified: true, role: "judge" })
      .where(eq(user.id, signUpResult.user.id));

    await requestAccessRecoveryEmail({
      email: "usuario@example.com",
      requestUrl: "http://localhost:3000/recuperar-acceso",
    });

    const resetToken = await db.query.verification.findFirst({
      where: eq(verification.value, signUpResult.user.id),
    });

    expect(resetToken?.identifier).toMatch(/^reset-password:/);

    const rawToken = resetToken?.identifier.replace("reset-password:", "");

    expect(rawToken).toBeTruthy();

    const result = await resetAccessPassword({
      token: rawToken ?? "",
      newPassword: "new-password",
      request: new Request("http://localhost:3000/recuperar-acceso/nueva"),
    });

    expect(result).toEqual({ ok: true });

    await expect(
      auth.api.signInEmail({
        body: {
          email: "usuario@example.com",
          password: "new-password",
        },
      }),
    ).resolves.toMatchObject({
      user: { email: "usuario@example.com" },
    });

    const savedUser = await db.query.user.findFirst({
      where: eq(user.id, signUpResult.user.id),
    });
    const savedAcademies = await db.query.academies.findMany({
      where: eq(academies.userId, signUpResult.user.id),
    });

    expect(savedUser).toMatchObject({
      emailVerified: true,
      role: "judge",
    });
    expect(savedAcademies).toEqual([]);
  });
});

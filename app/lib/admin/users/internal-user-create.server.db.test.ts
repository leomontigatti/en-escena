import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { administrativeAuditEntries, user } from "@/db/schema";
import { createInternalUser } from "@/lib/admin/users/internal-user-create.server";
import { expectThrownResponse } from "@/lib/test-support/http";
import { action as signInAction } from "@/routes/ingresar";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("create internal user", () => {
  test("creates an internal user with normalized username, mandatory password change, and sanitized audit data", async () => {
    const adminUser = await createAdminUser("admin.creator@example.com");

    const result = await createInternalUser({
      name: "Jurado Principal",
      internalUsername: " Jurado.Principal ",
      role: "judge",
      temporaryPassword: "temporal-segura",
      email: "",
      createdByUserId: adminUser.id,
    });

    expect(result).toMatchObject({
      ok: true,
      userId: expect.any(String),
    });

    if (!result.ok) {
      throw new Error(
        `Expected internal user creation to succeed: ${result.error}`,
      );
    }

    const createdUserId = result.userId;

    const savedUser = await db.query.user.findFirst({
      where: eq(user.id, createdUserId),
    });

    expect(savedUser).toMatchObject({
      name: "Jurado Principal",
      role: "judge",
      internalUsername: "jurado.principal",
      requiresPasswordChange: true,
      emailVerified: false,
    });
    expect(savedUser?.email).toContain("jurado.principal");

    const loginResponse = await expectThrownResponse(
      submitSignInAction("Jurado.Principal", "temporal-segura"),
      302,
    );
    expect(loginResponse.headers.get("location")).toBe("/cambiar-contrasena");

    await expect(
      db
        .select()
        .from(administrativeAuditEntries)
        .where(eq(administrativeAuditEntries.entityId, createdUserId)),
    ).resolves.toEqual([
      expect.objectContaining({
        entityType: "user",
        action: "create",
        adminUserId: adminUser.id,
        beforeValues: {},
        afterValues: {
          email: null,
          internalUsername: "jurado.principal",
          name: "Jurado Principal",
          requiresPasswordChange: true,
          role: "judge",
        },
      }),
    ]);
  });

  test("saves optional email as unverified audit data without requiring it", async () => {
    const adminUser = await createAdminUser("admin.optional@example.com");

    const result = await createInternalUser({
      name: "Auditor Interno",
      internalUsername: "auditor.interno",
      role: "auditor",
      temporaryPassword: "temporal-segura",
      email: " Auditor.Interno@Example.COM ",
      createdByUserId: adminUser.id,
    });

    if (!result.ok) {
      throw new Error(
        `Expected internal user creation to succeed: ${result.error}`,
      );
    }

    const savedUser = await db.query.user.findFirst({
      where: eq(user.id, result.userId),
    });

    expect(savedUser).toMatchObject({
      email: "auditor.interno@example.com",
      emailVerified: false,
      internalUsername: "auditor.interno",
      role: "auditor",
    });

    await expect(
      db
        .select()
        .from(administrativeAuditEntries)
        .where(eq(administrativeAuditEntries.entityId, result.userId)),
    ).resolves.toEqual([
      expect.objectContaining({
        afterValues: expect.objectContaining({
          email: "auditor.interno@example.com",
          internalUsername: "auditor.interno",
          role: "auditor",
        }),
      }),
    ]);
  });
});

async function createAdminUser(email: string) {
  const [adminUser] = await db
    .insert(user)
    .values({
      email,
      name: "Admin Creator",
      emailVerified: true,
      role: "admin",
    })
    .returning();

  if (!adminUser) {
    throw new Error("Expected admin user to be created.");
  }

  return adminUser;
}

function submitSignInAction(identifier: string, password: string) {
  const formData = new FormData();
  formData.set("identifier", identifier);
  formData.set("password", password);

  return signInAction({
    url: new URL("http://localhost/ingresar"),
    pattern: "/ingresar",
    request: new Request("http://localhost/ingresar", {
      method: "POST",
      body: formData,
    }),
    params: {},
    context: {},
  });
}

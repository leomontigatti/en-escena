import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import { createInternalUser } from "@/lib/admin/users/internal-user-create.server";
import { expectThrownResponse } from "@/lib/test-support/http";
import { action as signInAction } from "@/routes/ingresar";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("create internal user", () => {
  test("creates an internal user with a normalized username and a mandatory password change", async () => {
    const adminUser = await createAdminUser("admin.creator@example.com");

    const result = await createInternalUser({
      name: "Jurado Principal",
      internalUsername: " Jurado.Principal ",
      role: "judge",
      temporaryPassword: "temporal-segura",
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
    expect(savedUser?.email).toBe("jurado.principal@enescena.com.ar");

    const loginResponse = await expectThrownResponse(
      submitSignInAction("Jurado.Principal", "temporal-segura"),
      302,
    );
    expect(loginResponse.headers.get("location")).toBe("/cambiar-contrasena");
  });

  test("refuses a reserved internal username", async () => {
    const adminUser = await createAdminUser("admin.reservado@example.com");

    for (const reservedUsername of ["acceso", "dmarc"]) {
      await expect(
        createInternalUser({
          name: "Usuario Reservado",
          internalUsername: reservedUsername,
          role: "judge",
          temporaryPassword: "temporal-segura",
          createdByUserId: adminUser.id,
        }),
      ).resolves.toEqual({
        ok: false,
        error: "Ese nombre de usuario interno está reservado.",
      });
    }
  });

  test("refuses a username whose credential email is already taken", async () => {
    const adminUser = await createAdminUser("admin.ocupado@example.com");

    await db.insert(user).values({
      email: "auditor.interno@enescena.com.ar",
      emailVerified: false,
      name: "Otro Usuario",
      role: "academy",
    });

    await expect(
      createInternalUser({
        name: "Auditor Interno",
        internalUsername: "auditor.interno",
        role: "auditor",
        temporaryPassword: "temporal-segura",
        createdByUserId: adminUser.id,
      }),
    ).resolves.toEqual({
      ok: false,
      error:
        "No pudimos reservar el acceso interno. Intentá con otro nombre de usuario.",
    });
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

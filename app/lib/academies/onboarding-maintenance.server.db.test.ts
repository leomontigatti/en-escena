import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { listIncompleteAcademyOnboardingUsers } from "@/lib/academies/onboarding-maintenance.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("academy onboarding maintenance", () => {
  test("lists confirmed academy users without an Academia and skips completed onboarding", async () => {
    const pending = await createLocalAccessUser({
      email: "pendiente.mantenimiento@example.com",
      name: "pendiente.mantenimiento@example.com",
      password: "password-segura",
    });
    const completed = await createLocalAccessUser({
      email: "completa.mantenimiento@example.com",
      name: "completa.mantenimiento@example.com",
      password: "password-segura",
    });

    await db
      .update(user)
      .set({ emailVerified: true, role: "academy" })
      .where(eq(user.id, pending.user.id));
    await db
      .update(user)
      .set({ emailVerified: true, role: "academy" })
      .where(eq(user.id, completed.user.id));

    await db.insert(academies).values({
      userId: completed.user.id,
      name: "Academia Completa",
      contactName: "Contacto Completo",
      phone: "1112345678",
    });

    await expect(listIncompleteAcademyOnboardingUsers()).resolves.toEqual([
      {
        createdAt: expect.any(Date),
        email: "pendiente.mantenimiento@example.com",
        userId: pending.user.id,
      },
    ]);
  });
});

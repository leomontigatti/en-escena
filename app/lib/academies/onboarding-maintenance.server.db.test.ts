import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { createAccessUser } from "@/lib/auth/access-auth.test-support";
import { listIncompleteAcademyOnboardingUsers } from "@/lib/academies/onboarding-maintenance.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("academy onboarding maintenance", () => {
  test("lists confirmed academy users without an Academia and skips completed onboarding", async () => {
    const pending = await createAccessUser({
      email: "pendiente.mantenimiento@example.com",
      name: "pendiente.mantenimiento@example.com",
      password: "password-segura",
    });
    const completed = await createAccessUser({
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

  test("can limit incomplete onboarding users to older confirmed identities", async () => {
    const older = await createAccessUser({
      email: "antigua.mantenimiento@example.com",
      name: "antigua.mantenimiento@example.com",
      password: "password-segura",
    });
    const recent = await createAccessUser({
      email: "reciente.mantenimiento@example.com",
      name: "reciente.mantenimiento@example.com",
      password: "password-segura",
    });
    const cutoff = new Date("2026-06-01T00:00:00.000Z");

    await db
      .update(user)
      .set({
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        emailVerified: true,
        role: "academy",
      })
      .where(eq(user.id, older.user.id));
    await db
      .update(user)
      .set({
        createdAt: new Date("2026-06-15T00:00:00.000Z"),
        emailVerified: true,
        role: "academy",
      })
      .where(eq(user.id, recent.user.id));

    await expect(
      listIncompleteAcademyOnboardingUsers({ createdBefore: cutoff }),
    ).resolves.toEqual([
      {
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        email: "antigua.mantenimiento@example.com",
        userId: older.user.id,
      },
    ]);
  });
});

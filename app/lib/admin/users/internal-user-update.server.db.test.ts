import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import { updateInternalUser } from "@/lib/admin/users/internal-user-update.server";
import type { InternalUserRole } from "@/lib/auth/internal-user-roles";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

const lockedPermissionError =
  "No se puede cambiar el permiso de un Administrador.";

describe("update internal user", () => {
  test("refuses every change away from the administrator permission", async () => {
    const actingAdmin = await createInternalUserRow({
      email: "admin.actor@example.com",
      internalUsername: "admin.actor",
      name: "Admin Actor",
      role: "admin",
    });
    const otherAdmin = await createInternalUserRow({
      email: "admin.otro@example.com",
      internalUsername: "admin.otro",
      name: "Admin Otro",
      role: "admin",
    });

    for (const role of ["auditor", "judge"] as const) {
      await expect(
        updateInternalUser({
          userId: otherAdmin.id,
          name: "Admin Otro",
          role,
          updatedByUserId: actingAdmin.id,
        }),
      ).resolves.toEqual({ ok: false, error: lockedPermissionError });
    }

    await expect(
      updateInternalUser({
        userId: actingAdmin.id,
        name: "Admin Actor",
        role: "auditor",
        updatedByUserId: actingAdmin.id,
      }),
    ).resolves.toEqual({ ok: false, error: lockedPermissionError });

    await expect(
      db.query.user.findFirst({
        columns: { role: true },
        where: eq(user.id, otherAdmin.id),
      }),
    ).resolves.toMatchObject({ role: "admin" });
  });

  test("keeps name and email edits working on an administrator account", async () => {
    const actingAdmin = await createInternalUserRow({
      email: "admin.editor@example.com",
      internalUsername: "admin.editor",
      name: "Admin Editor",
      role: "admin",
    });
    const targetAdmin = await createInternalUserRow({
      email: "admin.editado@example.com",
      internalUsername: "admin.editado",
      name: "Admin Editado",
      role: "admin",
    });

    await expect(
      updateInternalUser({
        userId: targetAdmin.id,
        name: "Admin Renombrado",
        role: "admin",
        email: "admin.renombrado@example.com",
        updatedByUserId: actingAdmin.id,
      }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      db.query.user.findFirst({
        columns: { email: true, name: true, role: true },
        where: eq(user.id, targetAdmin.id),
      }),
    ).resolves.toMatchObject({
      email: "admin.renombrado@example.com",
      name: "Admin Renombrado",
      role: "admin",
    });
  });

  test("still promotes a judge or an auditor to administrator", async () => {
    const actingAdmin = await createInternalUserRow({
      email: "admin.promotor@example.com",
      internalUsername: "admin.promotor",
      name: "Admin Promotor",
      role: "admin",
    });
    const judgeUser = await createInternalUserRow({
      email: "juez.promovible@example.com",
      internalUsername: "juez.promovible",
      name: "Juez Promovible",
      role: "judge",
    });
    const auditorUser = await createInternalUserRow({
      email: "auditor.promovible@example.com",
      internalUsername: "auditor.promovible",
      name: "Auditor Promovible",
      role: "auditor",
    });

    for (const promoted of [judgeUser, auditorUser]) {
      await expect(
        updateInternalUser({
          userId: promoted.id,
          name: promoted.name,
          role: "admin",
          updatedByUserId: actingAdmin.id,
        }),
      ).resolves.toMatchObject({ ok: true });

      await expect(
        db.query.user.findFirst({
          columns: { role: true },
          where: eq(user.id, promoted.id),
        }),
      ).resolves.toMatchObject({ role: "admin" });
    }
  });
});

async function createInternalUserRow({
  email,
  internalUsername,
  name,
  role,
}: {
  email: string;
  internalUsername: string;
  name: string;
  role: InternalUserRole;
}) {
  const [createdUser] = await db
    .insert(user)
    .values({
      email,
      emailVerified: false,
      internalUsername,
      name,
      role,
    })
    .returning();

  if (!createdUser) {
    throw new Error(`Expected the "${internalUsername}" user to be created.`);
  }

  return createdUser;
}

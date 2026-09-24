import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  choreographies,
  dancers,
  payments,
  professors,
  user,
} from "@/db/schema";
import { deleteEmptyAcademy } from "@/lib/academies/academy-deletion.server";
import {
  createEventChoreographyFixture,
  createSavedEvent,
} from "@/lib/events/bases-test-fixtures.server.db";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("deleteEmptyAcademy", () => {
  test("deletes an empty academy together with its user", async () => {
    const { academyId, userId } = await createAcademyUser({
      academyName: "Academia Vacía",
      email: "vacia@example.com",
    });

    const result = await deleteEmptyAcademy(academyId);

    expect(result).toEqual({
      ok: true,
      academy: { id: academyId, name: "Academia Vacía" },
    });
    await expect(
      db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.id, academyId)),
    ).resolves.toEqual([]);
    await expect(
      db.select({ id: user.id }).from(user).where(eq(user.id, userId)),
    ).resolves.toEqual([]);
  });

  test("refuses an academy that still holds dancers, naming only what it holds", async () => {
    const { academyId } = await createAcademyUser({
      academyName: "Academia Llena",
      email: "llena@example.com",
    });

    await db.insert(dancers).values([
      {
        academyId,
        firstName: "Ana",
        lastName: "Gómez",
        birthDate: "2010-01-01",
      },
      {
        academyId,
        firstName: "Bruno",
        lastName: "Pérez",
        birthDate: "2011-01-01",
      },
    ]);

    const result = await deleteEmptyAcademy(academyId);

    expect(result).toEqual({
      ok: false,
      message: "No se puede eliminar la academia: tiene 2 bailarines.",
    });
    await expect(
      db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.id, academyId)),
    ).resolves.toHaveLength(1);
  });

  test("names every kind it still holds, in one enumeration", async () => {
    const { academyId } = await createAcademyUser({
      academyName: "Academia Mixta",
      email: "mixta@example.com",
    });
    const event = await createSavedEvent("Evento Academia Mixta");

    await db.insert(professors).values({
      academyId,
      firstName: "Clara",
      lastName: "Díaz",
    });
    await db.insert(payments).values({
      academyId,
      eventId: event.id,
      paymentNumber: 1,
      paymentDate: "2026-05-01",
      amount: 1000,
      paymentMethod: "efectivo",
    });

    await expect(deleteEmptyAcademy(academyId)).resolves.toEqual({
      ok: false,
      message: "No se puede eliminar la academia: tiene 1 profesor y 1 pago.",
    });
  });

  test("refuses an academy whose only choreography is withdrawn", async () => {
    const { academyId } = await createAcademyUser({
      academyName: "Academia Retirada",
      email: "retirada@example.com",
    });
    const event = await createSavedEvent("Evento Academia Retirada");
    const fixture = await createEventChoreographyFixture({
      academyId,
      eventId: event.id,
      name: "Pieza Retirada",
    });

    await db
      .update(choreographies)
      .set({ withdrawnAt: new Date("2026-05-02T00:00:00.000Z") })
      .where(eq(choreographies.id, fixture.id));

    const result = await deleteEmptyAcademy(academyId);

    expect(result).toEqual({
      ok: false,
      message: "No se puede eliminar la academia: tiene 1 coreografía.",
    });
  });
});

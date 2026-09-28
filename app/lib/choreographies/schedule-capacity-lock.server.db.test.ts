import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  scheduleCategories,
  schedules,
  scheduleCapacities,
} from "@/db/schema";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import {
  invalidScheduleEntryMessage,
  lockScheduleAcceptance,
  lockScheduleCapacityForAssignment,
} from "@/lib/choreographies/schedule-capacity-lock.server";
import {
  createAcademySession,
  createDancer,
  createGrupalOnlyModalityFixture,
  createOpenEventCatalog,
  createProfessor,
  createScheduleForModalityFixture,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

async function createSingleSlotRegistration(input: {
  academyName: string;
  email: string;
}) {
  const owner = await createAcademySession(input);
  const { event, catalog } = await createOpenEventCatalog();
  const dancer = await createDancer(owner.academyId, {
    birthDate: "2014-05-01",
  });
  const professor = await createProfessor(owner.academyId);

  await db
    .update(scheduleCapacities)
    .set({ capacity: 1 })
    .where(eq(scheduleCapacities.id, catalog.soloScheduleCapacity.id));

  const registration = await createChoreographyRegistration({
    academyId: owner.academyId,
    eventId: event.id,
    name: "Pieza ocupante",
    modalityId: catalog.modality.id,
    submodalityId: catalog.submodality.id,
    dancerIds: [dancer.id],
    professorIds: [professor.id],
    experienceLevelId: catalog.level.id,
    scheduleCapacityId: catalog.soloScheduleCapacity.id,
  });

  if (!registration.ok) {
    throw new Error(`Unexpected registration failure: ${registration.error}`);
  }

  return { catalog, choreography: registration.choreography, event };
}

describe("schedule capacity lock", () => {
  // The accepted modalities and categories are read after the schedule row is
  // locked, the row a schedule edit locks before narrowing them, so a
  // placement cannot land on a schedule an edit just stopped accepting it on.
  test("refuses a choreography whose modality the locked schedule no longer accepts", async () => {
    const { event, catalog } = await createOpenEventCatalog();
    const otherModality = await createGrupalOnlyModalityFixture(event.id);

    const result = await db.transaction((tx) =>
      lockScheduleCapacityForAssignment({
        tx,
        scheduleId: catalog.schedule.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
        accepts: {
          modalityId: otherModality.modality.id,
          categoryId: catalog.childCategory.id,
        },
      }),
    );

    expect(result).toEqual({
      ok: false,
      code: "invalid-schedule-capacity",
      incompatibility: "modality",
      error: invalidScheduleEntryMessage,
    });
  });

  test("refuses a choreography whose category the locked schedule no longer accepts", async () => {
    const { catalog } = await createOpenEventCatalog();
    await db.insert(scheduleCategories).values({
      scheduleId: catalog.schedule.id,
      categoryId: catalog.teenCategory.id,
    });

    const result = await db.transaction((tx) =>
      lockScheduleCapacityForAssignment({
        tx,
        scheduleId: catalog.schedule.id,
        scheduleCapacityId: null,
        accepts: {
          modalityId: catalog.modality.id,
          categoryId: catalog.childCategory.id,
        },
      }),
    );

    expect(result).toEqual({
      ok: false,
      code: "invalid-schedule-capacity",
      incompatibility: "category",
      error: invalidScheduleEntryMessage,
    });
  });

  test("locks a schedule that accepts the choreography without counting its places", async () => {
    const { event, catalog } = await createOpenEventCatalog();
    const otherModality = await createGrupalOnlyModalityFixture(event.id);
    await db
      .update(schedules)
      .set({ totalCapacity: 1 })
      .where(eq(schedules.id, catalog.schedule.id));
    await db.insert(scheduleCategories).values({
      scheduleId: catalog.schedule.id,
      categoryId: catalog.childCategory.id,
    });

    const [accepted, category, modality] = await db.transaction(async (tx) => [
      await lockScheduleAcceptance({
        tx,
        scheduleId: catalog.schedule.id,
        accepts: {
          modalityId: catalog.modality.id,
          categoryId: catalog.childCategory.id,
        },
      }),
      await lockScheduleAcceptance({
        tx,
        scheduleId: catalog.schedule.id,
        accepts: {
          modalityId: catalog.modality.id,
          categoryId: catalog.teenCategory.id,
        },
      }),
      await lockScheduleAcceptance({
        tx,
        scheduleId: catalog.schedule.id,
        accepts: {
          modalityId: otherModality.modality.id,
          categoryId: catalog.childCategory.id,
        },
      }),
    ]);

    expect(accepted).toEqual({ ok: true });
    expect(category).toMatchObject({ ok: false, incompatibility: "category" });
    expect(modality).toMatchObject({ ok: false, incompatibility: "modality" });
  });

  test("keeps the capacity available for the choreography that already occupies it", async () => {
    const { catalog, choreography } = await createSingleSlotRegistration({
      academyName: "Academia Cupo Excluido",
      email: "cupo.cronograma.excluido@example.com",
    });

    const result = await db.transaction((tx) =>
      lockScheduleCapacityForAssignment({
        tx,
        scheduleId: catalog.schedule.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
        excludeChoreographyId: choreography.id,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      scheduleId: catalog.schedule.id,
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
    });
  });

  test("reports the capacity as full when no choreography is excluded", async () => {
    const { catalog } = await createSingleSlotRegistration({
      academyName: "Academia Cupo Lleno",
      email: "cupo.cronograma.lleno@example.com",
    });

    const result = await db.transaction((tx) =>
      lockScheduleCapacityForAssignment({
        tx,
        scheduleId: catalog.schedule.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    );

    // `limit` is what tells a caller which of the two limits refused it —
    // restoring words its own refusal from it instead of reading the message.
    expect(result).toMatchObject({
      ok: false,
      code: "schedule-capacity-full",
      limit: "schedule-capacity",
      error: "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
    });
  });

  // The place a withdrawn choreography used to fill is free for anybody else,
  // with no exclusion asked for: the row is simply not counted.
  test("frees the place a withdrawn choreography used to fill", async () => {
    const { catalog, choreography } = await createSingleSlotRegistration({
      academyName: "Academia Cupo Retirada",
      email: "cupo.cronograma.retirada@example.com",
    });
    await db
      .update(choreographies)
      .set({ withdrawnAt: new Date() })
      .where(eq(choreographies.id, choreography.id));

    const result = await db.transaction((tx) =>
      lockScheduleCapacityForAssignment({
        tx,
        scheduleId: catalog.schedule.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      scheduleId: catalog.schedule.id,
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
    });
  });

  test("keeps the schedule total available for the choreography that already occupies it", async () => {
    const { catalog, choreography } = await createSingleSlotRegistration({
      academyName: "Academia Cronograma Excluido",
      email: "cronograma.total.excluido@example.com",
    });

    await db
      .update(schedules)
      .set({ totalCapacity: 1 })
      .where(eq(schedules.id, catalog.schedule.id));

    await expect(
      db.transaction((tx) =>
        lockScheduleCapacityForAssignment({
          tx,
          scheduleId: catalog.schedule.id,
          scheduleCapacityId: null,
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "schedule-capacity-full",
      limit: "schedule-total",
      error: "El cronograma seleccionado ya no tiene cupo disponible.",
    });

    await expect(
      db.transaction((tx) =>
        lockScheduleCapacityForAssignment({
          tx,
          scheduleId: catalog.schedule.id,
          scheduleCapacityId: null,
          excludeChoreographyId: choreography.id,
        }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      scheduleId: catalog.schedule.id,
      scheduleCapacityId: null,
    });
  });

  test("rejects a capacity that belongs to a different schedule", async () => {
    const { catalog, event } = await createSingleSlotRegistration({
      academyName: "Academia Cupo De Otro Cronograma",
      email: "cupo.de.otro.cronograma@example.com",
    });
    const otherSchedule = await createScheduleForModalityFixture({
      eventId: event.id,
      modalityId: catalog.modality.id,
    });

    const result = await db.transaction((tx) =>
      lockScheduleCapacityForAssignment({
        tx,
        scheduleId: otherSchedule.id,
        scheduleCapacityId: catalog.duoScheduleCapacity.id,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "invalid-schedule-capacity",
    });
  });

  test("rejects a schedule that no longer exists", async () => {
    await createSingleSlotRegistration({
      academyName: "Academia Cronograma Inexistente",
      email: "cronograma.inexistente@example.com",
    });

    const result = await db.transaction((tx) =>
      lockScheduleCapacityForAssignment({
        tx,
        scheduleId: "00000000-0000-0000-0000-000000000000",
        scheduleCapacityId: null,
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "invalid-schedule-capacity",
    });
  });
});

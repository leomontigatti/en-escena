import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { schedules, scheduleCapacities } from "@/db/schema";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import { lockScheduleCapacityForAssignment } from "@/lib/choreographies/schedule-capacity-lock.server";
import {
  createAcademySession,
  createDancer,
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

describe.sequential("schedule capacity lock", () => {
  test("keeps the cupo available for the choreography that already occupies it", async () => {
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

  test("reports the cupo as full when no choreography is excluded", async () => {
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

    expect(result).toMatchObject({
      ok: false,
      code: "schedule-capacity-full",
      error: "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
    });
  });

  test("keeps the cronograma total available for the choreography that already occupies it", async () => {
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

  test("rejects a cupo that belongs to a different cronograma", async () => {
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

  test("rejects a cronograma that no longer exists", async () => {
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

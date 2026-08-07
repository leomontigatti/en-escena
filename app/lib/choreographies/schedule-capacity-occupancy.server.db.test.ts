import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { schedules, scheduleCapacities } from "@/db/schema";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import {
  resolveScheduleCapacityOccupancies,
  toScheduleCapacityOccupancyKey,
} from "@/lib/choreographies/schedule-capacity-occupancy.server";
import {
  createAcademySession,
  createDancer,
  createOpenEventCatalog,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("schedule capacity occupancy", () => {
  test("counts the choreographies assigned to each cupo", async () => {
    const scenario = await createOccupiedCupo({
      academyName: "Academia Ocupación",
      email: "cupo.ocupacion@example.com",
    });

    const occupancy = await readOccupancy(scenario);

    expect(occupancy).toEqual({
      capacity: 5,
      isFull: false,
      occupiedCount: 1,
    });
  });

  test("leaves the excluded choreography out of the count of its own cupo", async () => {
    const scenario = await createOccupiedCupo({
      academyName: "Academia Ocupación Excluida",
      email: "cupo.ocupacion.excluida@example.com",
    });
    await db
      .update(scheduleCapacities)
      .set({ capacity: 1 })
      .where(eq(scheduleCapacities.id, scenario.scheduleCapacityId));

    const occupancy = await readOccupancy(scenario, {
      excludeChoreographyId: scenario.choreographyId,
    });

    expect(occupancy).toEqual({
      capacity: 1,
      isFull: false,
      occupiedCount: 0,
    });
  });

  // El cupo puntual con lugar no alcanza: el servidor rechaza igual cuando el
  // cronograma que lo contiene se agotó, así que la opción se ve llena.
  test("marks a cupo with room as full when its cronograma is full", async () => {
    const scenario = await createOccupiedCupo({
      academyName: "Academia Cronograma Agotado",
      email: "cupo.ocupacion.cronograma@example.com",
    });
    await db
      .update(schedules)
      .set({ totalCapacity: 1 })
      .where(eq(schedules.id, scenario.scheduleId));

    const occupancy = await readOccupancy(scenario);

    expect(occupancy).toMatchObject({
      capacity: 5,
      isFull: true,
      occupiedCount: 1,
    });
  });

  test("falls back to the cronograma capacity when the option declares no cupo", async () => {
    const scenario = await createOccupiedCupo({
      academyName: "Academia Cupo Global",
      email: "cupo.ocupacion.global@example.com",
    });

    const occupancies = await resolveScheduleCapacityOccupancies({
      targets: [{ scheduleCapacityId: null, scheduleId: scenario.scheduleId }],
    });

    expect(
      occupancies.get(
        toScheduleCapacityOccupancyKey({
          scheduleCapacityId: null,
          scheduleId: scenario.scheduleId,
        }),
      ),
    ).toEqual({ capacity: 10, isFull: false, occupiedCount: 1 });
  });
});

async function createOccupiedCupo(input: {
  academyName: string;
  email: string;
}) {
  const owner = await createAcademySession(input);
  const { event, catalog } = await createOpenEventCatalog();
  const dancer = await createDancer(owner.academyId, {
    birthDate: "2014-05-01",
  });
  const professor = await createProfessor(owner.academyId);
  const registration = await createChoreographyRegistration({
    academyId: owner.academyId,
    dancerIds: [dancer.id],
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Pieza ocupante",
    professorIds: [professor.id],
    scheduleCapacityId: catalog.soloScheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  if (!registration.ok) {
    throw new Error(`Unexpected registration failure: ${registration.error}`);
  }

  return {
    choreographyId: registration.choreography.id,
    scheduleCapacityId: catalog.soloScheduleCapacity.id,
    scheduleId: catalog.schedule.id,
  };
}

async function readOccupancy(
  scenario: { scheduleCapacityId: string; scheduleId: string },
  options: { excludeChoreographyId?: string } = {},
) {
  const target = {
    scheduleCapacityId: scenario.scheduleCapacityId,
    scheduleId: scenario.scheduleId,
  };
  const occupancies = await resolveScheduleCapacityOccupancies({
    excludeChoreographyId: options.excludeChoreographyId,
    targets: [target],
  });

  return occupancies.get(toScheduleCapacityOccupancyKey(target));
}

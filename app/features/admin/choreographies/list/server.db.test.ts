import { describe, expect, test } from "vitest";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, choreographyProfessors, schedules } from "@/db/schema";
import { createSignedInAdminRequest as createSignedInRequest } from "@/lib/admin/test-support/db";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  loadChoreographies,
  loadChoreographyListRouteData,
} from "@/features/admin/choreographies/list/server";
import {
  createChoreographyRecord,
  createEventCatalog,
  createProfessor,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe("loadChoreographyListRouteData", () => {
  test("redirects invalid filters to the canonical list URL", async () => {
    const event = await createSavedEvent();
    const { request } = await createSignedInRequest({
      email: "admin.coreografias.feature@example.com",
      role: "admin",
      requestUrl:
        `http://localhost/administracion/coreografias?evento=${event.id}` +
        "&estado=pendiente&modalidad=modalidad_invalida" +
        "&categoria=categoria_invalida&tipo-grupo=pareja&dia=2026-13-40" +
        "&pagina=2",
    });

    const response = await expectThrownResponse(
      loadChoreographyListRouteData(request),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      `/administracion/coreografias?evento=${event.id}`,
    );
  });
});

describe("loadChoreographies", () => {
  // A day is not a schedule: an event may run several blocks on the same date,
  // and an admin looking at "that Saturday" wants all of them at once.
  test("gathers every schedule of a day behind a single day filter", async () => {
    const { event, scheduledChoreographies } = await seedChoreographiesByDay();

    const result = await loadChoreographies({
      filters: buildFilters({ scheduleDate: "2026-05-02" }),
      selectedEventId: event.id,
    });

    expect(result.choreographies.map((row) => row.name)).toEqual([
      scheduledChoreographies.morning.name,
      scheduledChoreographies.evening.name,
    ]);
  });

  test("offers the days in calendar order", async () => {
    const { event } = await seedChoreographiesByDay();

    const result = await loadChoreographies({
      filters: buildFilters(),
      selectedEventId: event.id,
    });

    expect(result.facets.scheduleDates).toEqual([
      { label: "1 de mayo de 2026", value: "2026-05-01" },
      { label: "2 de mayo de 2026", value: "2026-05-02" },
    ]);
  });

  // A mis-filed choreography competes against the wrong people, so it belongs on
  // the same fix list as an incomplete one: no new filter value, the existing
  // `incompleta` gathers it.
  test("gathers the mis-filed choreographies under the incomplete filter", async () => {
    const { event, misfiled, wellFiled } = await seedMisfiledChoreographies();

    const result = await loadChoreographies({
      filters: buildFilters({ status: "incompleta" }),
      selectedEventId: event.id,
    });
    const misfiledRow = result.choreographies.find(
      (row) => row.name === misfiled.name,
    );
    const strayLevelRow = result.choreographies.find(
      (row) => row.name === "Coreografía con nivel ajeno",
    );

    expect(misfiledRow?.operationalStatus.pendingItems).toContain(
      "categoryAgeMismatch",
    );
    expect(strayLevelRow?.operationalStatus.pendingItems).toContain(
      "experienceLevelMismatch",
    );
    expect(result.choreographies.map((row) => row.name)).not.toContain(
      wellFiled.name,
    );
  });

  // The list answers "what is going to be performed", so a choreography that
  // was withdrawn is out of it until the reader asks for it by name.
  test("hides the withdrawn choreographies until `Retirada` is picked", async () => {
    const { event, withdrawn, performing } = await seedWithdrawnChoreography();

    const [unfiltered, withdrawnOnly, complete] = await Promise.all([
      loadChoreographies({
        filters: buildFilters(),
        selectedEventId: event.id,
      }),
      loadChoreographies({
        filters: buildFilters({ status: "retirada" }),
        selectedEventId: event.id,
      }),
      loadChoreographies({
        filters: buildFilters({ status: "completa" }),
        selectedEventId: event.id,
      }),
    ]);

    expect(unfiltered.choreographies.map((row) => row.name)).toEqual([
      performing.name,
    ]);
    expect(withdrawnOnly.choreographies.map((row) => row.name)).toEqual([
      withdrawn.name,
    ]);
    expect(withdrawnOnly.choreographies[0]?.isWithdrawn).toBe(true);
    // The withdrawal axis wins over the readiness one: the withdrawn row is
    // complete, and `Completa` still does not turn it up.
    expect(complete.choreographies.map((row) => row.name)).not.toContain(
      withdrawn.name,
    );
  });

  test("keeps `retirada` in the canonical list URL", async () => {
    const { event } = await seedWithdrawnChoreography();
    const { request } = await createSignedInRequest({
      email: "admin.coreografias.retiradas@example.com",
      role: "admin",
      requestUrl:
        `http://localhost/administracion/coreografias?evento=${event.id}` +
        "&estado=retirada",
    });

    const result = await loadChoreographyListRouteData(request);

    expect(result.filters.status).toBe("retirada");
  });

  // `sin-asignar` was a day of its own while a choreography could go without a
  // schedule; it is now just another day the event does not hold.
  test.each(["2026-05-09", "sin-asignar"])(
    "drops the day `%s`, which the event does not hold",
    async (scheduleDate) => {
      const { event } = await seedChoreographiesByDay();

      const result = await loadChoreographies({
        filters: buildFilters({ scheduleDate }),
        selectedEventId: event.id,
      });

      expect(result.filters.scheduleDate).toBeNull();
      expect(result.choreographies).toHaveLength(3);
    },
  );
});

type ChoreographyFilters = Parameters<typeof loadChoreographies>[0]["filters"];
type EventCatalog = Awaited<ReturnType<typeof createEventCatalog>>;

function buildFilters(
  overrides: Partial<ChoreographyFilters> = {},
): ChoreographyFilters {
  return {
    category: null,
    groupType: null,
    modalityId: null,
    order: { columnId: "numero", direction: "asc" },
    page: 1,
    query: "",
    scheduleDate: null,
    status: null,
    ...overrides,
  };
}

async function seedChoreographiesByDay() {
  const event = await createSavedEvent();
  const catalog = await createEventCatalog(event.id);
  const academy = await createAcademyRecord({
    academyName: "Academia del Día",
    email: `coreografias.dia.${crypto.randomUUID()}@example.com`,
  });
  // Two blocks on the same date, so the filter is proven to gather a day and
  // not just a schedule; the catalog's own schedule stands for another day.
  const morningSchedule = await createScheduleOnDay({
    eventId: event.id,
    name: "Bloque mañana",
    scheduledDate: "2026-05-02",
    startTime: "10:00",
  });
  const eveningSchedule = await createScheduleOnDay({
    eventId: event.id,
    name: "Bloque noche",
    scheduledDate: "2026-05-02",
    startTime: "20:00",
  });
  const morning = await createScheduledChoreography({
    academyId: academy.id,
    catalog,
    eventId: event.id,
    name: "Coreografía de la mañana",
    scheduleId: morningSchedule.id,
  });
  const evening = await createScheduledChoreography({
    academyId: academy.id,
    catalog,
    eventId: event.id,
    name: "Coreografía de la noche",
    scheduleId: eveningSchedule.id,
  });
  await createScheduledChoreography({
    academyId: academy.id,
    catalog,
    eventId: event.id,
    name: "Coreografía del día anterior",
    scheduleId: catalog.schedule.id,
  });

  return {
    event,
    scheduledChoreographies: { evening, morning },
  };
}

/**
 * Three choreographies in the level-bearing category (1 to 17, `amateur`): one
 * filed under an age it no longer contains, one carrying a level it does not
 * admit, and one that still fits and has everything else loaded.
 */
async function seedMisfiledChoreographies() {
  const event = await createSavedEvent();
  const catalog = await createEventCatalog(event.id);
  const academy = await createAcademyRecord({
    academyName: "Academia Mal Ubicada",
    email: `coreografias.ubicacion.${crypto.randomUUID()}@example.com`,
  });
  const misfiled = await createChoreographyRecord({
    academyId: academy.id,
    categoryAgeBasis: 40,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Coreografía fuera de rango",
    scheduleCapacityId: catalog.scheduleCapacity.id,
  });
  await createChoreographyRecord({
    academyId: academy.id,
    categoryAgeBasis: 13,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: "elite",
    modalityId: catalog.modality.id,
    name: "Coreografía con nivel ajeno",
    scheduleCapacityId: catalog.scheduleCapacity.id,
  });
  const wellFiled = await createChoreographyRecord({
    academyId: academy.id,
    categoryAgeBasis: 13,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    musicStorageKey: "musica/ubicacion.mp3",
    name: "Coreografía bien ubicada",
    scheduleCapacityId: catalog.scheduleCapacity.id,
  });
  const professor = await createProfessor(academy.id);
  await db.insert(choreographyProfessors).values({
    choreographyId: wellFiled.id,
    professorId: professor.id,
  });

  return { event, misfiled, wellFiled };
}

/**
 * One withdrawn choreography and one still taking part, both complete, so the
 * two axes of the `Estado` filter are told apart by the withdrawal alone.
 */
async function seedWithdrawnChoreography() {
  const event = await createSavedEvent();
  const catalog = await createEventCatalog(event.id);
  const academy = await createAcademyRecord({
    academyName: "Academia Retirada",
    email: `coreografias.retirada.${crypto.randomUUID()}@example.com`,
  });
  const professor = await createProfessor(academy.id);
  const [withdrawn, performing] = await Promise.all(
    ["Coreografía retirada", "Coreografía en pie"].map(async (name) => {
      const choreography = await createChoreographyRecord({
        academyId: academy.id,
        categoryId: catalog.categoryWithoutLevel.id,
        eventId: event.id,
        modalityId: catalog.modality.id,
        musicStorageKey: `musica/${crypto.randomUUID()}.mp3`,
        name,
        scheduleCapacityId: catalog.scheduleCapacity.id,
      });

      await db
        .insert(choreographyProfessors)
        .values({ choreographyId: choreography.id, professorId: professor.id });

      return choreography;
    }),
  );

  await db
    .update(choreographies)
    .set({ withdrawnAt: new Date("2026-09-17T12:00:00Z") })
    .where(eq(choreographies.id, withdrawn.id));

  return { event, performing, withdrawn };
}

async function createScheduleOnDay(input: {
  eventId: string;
  name: string;
  scheduledDate: string;
  startTime: string;
}) {
  const [schedule] = await db
    .insert(schedules)
    .values({ ...input, totalCapacity: 10 })
    .returning();

  return schedule;
}

async function createScheduledChoreography(input: {
  academyId: string;
  catalog: EventCatalog;
  eventId: string;
  name: string;
  scheduleId: string;
}) {
  return await createChoreographyRecord({
    academyId: input.academyId,
    eventId: input.eventId,
    modalityId: input.catalog.modality.id,
    categoryId: input.catalog.categoryWithoutLevel.id,
    scheduleCapacityId: input.catalog.scheduleCapacity.id,
    scheduleId: input.scheduleId,
    name: input.name,
  });
}

async function createSavedEvent() {
  const result = await createEvent({
    name: "Nacional 2026",
    registrationStartsAt: new Date("2026-08-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-09-15T12:00:00Z"),
    startsAt: new Date("2026-10-01T12:00:00Z"),
    endsAt: new Date("2026-10-10T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  await activateEvent(result.event.id);

  return result.event;
}

async function expectThrownResponse<T>(
  promise: Promise<T>,
  expectedStatus: number,
) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBe(expectedStatus);
    return response;
  }

  throw new Error(`Expected a Response with status ${expectedStatus}.`);
}

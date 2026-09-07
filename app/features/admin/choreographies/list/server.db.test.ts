import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, schedules } from "@/db/schema";
import { createSignedInAdminRequest as createSignedInRequest } from "@/lib/admin/test-support/db";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  loadChoreographies,
  loadChoreographyListRouteData,
} from "@/features/admin/choreographies/list/server";
import {
  createChoreographyRecord,
  createEventCatalog,
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

  test("offers the days in calendar order and the unscheduled ones last", async () => {
    const { event } = await seedChoreographiesByDay();

    const result = await loadChoreographies({
      filters: buildFilters(),
      selectedEventId: event.id,
    });

    expect(result.facets.scheduleDates).toEqual([
      { label: "1 de mayo de 2026", value: "2026-05-01" },
      { label: "2 de mayo de 2026", value: "2026-05-02" },
      { label: "Sin asignar", value: "sin-asignar" },
    ]);
  });

  test("keeps the choreographies still waiting for a schedule apart", async () => {
    const { event, unscheduledChoreography } = await seedChoreographiesByDay();

    const result = await loadChoreographies({
      filters: buildFilters({ scheduleDate: "sin-asignar" }),
      selectedEventId: event.id,
    });

    expect(result.choreographies.map((row) => row.name)).toEqual([
      unscheduledChoreography.name,
    ]);
  });

  test("drops a day the event does not hold", async () => {
    const { event } = await seedChoreographiesByDay();

    const result = await loadChoreographies({
      filters: buildFilters({ scheduleDate: "2026-05-09" }),
      selectedEventId: event.id,
    });

    expect(result.filters.scheduleDate).toBeNull();
    expect(result.choreographies).toHaveLength(4);
  });
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
  const unscheduledChoreography = await createChoreographyRecord({
    academyId: academy.id,
    eventId: event.id,
    modalityId: catalog.modality.id,
    scheduleCapacityId: catalog.scheduleCapacity.id,
    name: "Coreografía sin cronograma",
  });

  return {
    event,
    scheduledChoreographies: { evening, morning },
    unscheduledChoreography,
  };
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
  const choreography = await createChoreographyRecord({
    academyId: input.academyId,
    eventId: input.eventId,
    modalityId: input.catalog.modality.id,
    scheduleCapacityId: input.catalog.scheduleCapacity.id,
    name: input.name,
  });

  await db
    .update(choreographies)
    .set({ scheduleId: input.scheduleId })
    .where(eq(choreographies.id, choreography.id));

  return choreography;
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

import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";
import {
  activateEvent,
  createEvent,
  deactivateEvent,
  deleteEvent,
  setEventVisibility,
} from "@/lib/event-management.server";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("event management", () => {
  test("creates inactive Eventos with deposit and visibility defaults", async () => {
    const result = await createEvent(eventInput({ name: "Regional 2026" }));

    expect(result).toMatchObject({
      ok: true,
      event: {
        name: "Regional 2026",
        active: false,
        programVisible: false,
        resultsVisible: false,
        requiredDepositPercentage: 30,
      },
    });

    const savedEvent = await db.query.events.findFirst();

    expect(savedEvent).toMatchObject({
      active: false,
      programVisible: false,
      resultsVisible: false,
      requiredDepositPercentage: 30,
    });
  });

  test.each([
    [
      "deposit below range",
      eventInput({ requiredDepositPercentage: -1 }),
      "requiredDepositPercentage",
    ],
    [
      "deposit above range",
      eventInput({ requiredDepositPercentage: 101 }),
      "requiredDepositPercentage",
    ],
    [
      "non-integer deposit",
      eventInput({ requiredDepositPercentage: 30.5 }),
      "requiredDepositPercentage",
    ],
    [
      "registration start at registration end",
      eventInput({
        registrationStartsAt: date("2026-03-10T12:00:00Z"),
        registrationEndsAt: date("2026-03-10T12:00:00Z"),
      }),
      "registrationStartsAt",
    ],
    [
      "event start after event end",
      eventInput({
        startsAt: date("2026-05-03T12:00:00Z"),
        endsAt: date("2026-05-02T12:00:00Z"),
      }),
      "startsAt",
    ],
    [
      "registration end after event end",
      eventInput({
        registrationEndsAt: date("2026-05-04T12:00:00Z"),
        endsAt: date("2026-05-03T12:00:00Z"),
      }),
      "registrationEndsAt",
    ],
  ] as const)(
    "rejects invalid Evento data: %s",
    async (_case, input, field) => {
      const result = await createEvent(input);

      expect(result).toMatchObject({
        ok: false,
        code: "invalid-event",
        fieldErrors: {
          [field]: expect.any(String),
        },
      });
      await expect(db.query.events.findMany()).resolves.toEqual([]);
    },
  );

  test("allows registration to start or end after the Evento starts", async () => {
    const result = await createEvent(
      eventInput({
        registrationStartsAt: date("2026-05-02T12:00:00Z"),
        registrationEndsAt: date("2026-05-03T12:00:00Z"),
        startsAt: date("2026-05-01T12:00:00Z"),
        endsAt: date("2026-05-04T12:00:00Z"),
      }),
    );

    expect(result).toMatchObject({ ok: true });
  });

  test("activates only when no other Evento is active", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");

    await expect(activateEvent(firstEvent.id)).resolves.toMatchObject({
      ok: true,
      event: { active: true },
    });

    await expect(activateEvent(secondEvent.id)).resolves.toMatchObject({
      ok: false,
      code: "active-event-exists",
      activeEventId: firstEvent.id,
      error:
        "Hay otro Evento activo. Desactivá el Evento activo antes de activar este.",
    });

    await deactivateEvent(firstEvent.id);

    await expect(activateEvent(secondEvent.id)).resolves.toMatchObject({
      ok: true,
      event: { active: true },
    });
  });

  test("enforces one active Evento at the database level", async () => {
    await db.insert(events).values({
      name: "Regional 2026",
      active: true,
      ...eventDates(),
    });

    await expect(
      db.insert(events).values({
        name: "Final 2026",
        active: true,
        ...eventDates(),
      }),
    ).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint_name: "event_single_active_unique",
      },
    });
  });

  test("deactivation leaves Evento data and visibility flags intact", async () => {
    const event = await createSavedEvent("Regional 2026");
    await activateEvent(event.id);
    await setEventVisibility(event.id, {
      programVisible: true,
      resultsVisible: true,
    });

    const result = await deactivateEvent(event.id);

    expect(result).toMatchObject({
      ok: true,
      event: {
        active: false,
        programVisible: true,
        resultsVisible: true,
        requiredDepositPercentage: 30,
      },
    });
  });

  test("updates program and results visibility independently of active status", async () => {
    const event = await createSavedEvent("Regional 2026");

    await expect(
      setEventVisibility(event.id, { programVisible: true }),
    ).resolves.toMatchObject({
      ok: true,
      event: { active: false, programVisible: true, resultsVisible: false },
    });

    await expect(
      setEventVisibility(event.id, { resultsVisible: true }),
    ).resolves.toMatchObject({
      ok: true,
      event: { active: false, programVisible: true, resultsVisible: true },
    });
  });

  test("deletes only inactive Eventos without operational dependencies", async () => {
    const activeEvent = await createSavedEvent("Activo");
    const dependentEvent = await createSavedEvent("Con dependencias");
    const deletableEvent = await createSavedEvent("Borrable");
    await activateEvent(activeEvent.id);

    await expect(deleteEvent(activeEvent.id)).resolves.toMatchObject({
      ok: false,
      code: "event-is-active",
    });

    await expect(
      deleteEvent(dependentEvent.id, {
        hasOperationalDependencies: async () => true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "event-has-operational-dependencies",
    });

    await expect(deleteEvent(deletableEvent.id)).resolves.toEqual({
      ok: true,
    });

    const remainingEvents = await db.query.events.findMany({
      columns: { name: true },
      orderBy: (table, { asc }) => asc(table.name),
    });

    expect(remainingEvents).toEqual([
      { name: "Activo" },
      { name: "Con dependencias" },
    ]);
  });
});

async function createSavedEvent(name: string) {
  const result = await createEvent(eventInput({ name }));

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

function eventInput(
  overrides: Partial<Parameters<typeof createEvent>[0]> = {},
) {
  return {
    name: "Evento 2026",
    ...eventDates(),
    ...overrides,
  };
}

function eventDates() {
  return {
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
  };
}

function date(value: string) {
  return new Date(value);
}

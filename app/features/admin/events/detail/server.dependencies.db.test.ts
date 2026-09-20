import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";
import { updateAdministrativeEvent } from "@/features/admin/events/detail/server";
import {
  createAdminRequest,
  eventFormBody,
  type EventRow,
} from "@/features/admin/events/detail/server.test-support";
import type { EventFormValues } from "@/lib/admin/events/form-values";
import { createChoreographyOnNewBases } from "@/lib/events/bases-test-fixtures.server.db";
import { createAdminSavedEvent } from "@/lib/events/saved-event-test-support.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const DEPENDENT_EDIT_ERROR =
  "No se pueden editar fechas ni seña con dependencias operativas.";

// The guard runs through the real action, with no injected double: the bug it
// covers was a stub predicate that the production path silently took.
describe.sequential("event dependencies on the event detail action", () => {
  test.each([
    ["startsAt", { startsAt: "2026-05-02" }],
    ["endsAt", { endsAt: "2026-06-05" }],
    ["registrationStartsAt", { registrationStartsAt: "2026-02-01" }],
    ["registrationEndsAt", { registrationEndsAt: "2026-04-15" }],
    ["requiredDepositPercentage", { requiredDepositPercentage: "45" }],
  ] as const)(
    "refuses a structural edit to %s on an event with choreographies",
    async (_field, change) => {
      const event = await createDependentEvent();

      const result = await save(event, change);

      expect(result).toMatchObject({
        status: "error",
        message: DEPENDENT_EDIT_ERROR,
      });
      await expect(readEvent(event.id)).resolves.toMatchObject({
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        registrationStartsAt: event.registrationStartsAt,
        registrationEndsAt: event.registrationEndsAt,
        requiredDepositPercentage: event.requiredDepositPercentage,
      });
    },
  );

  test("saves a non-structural edit to the same event", async () => {
    const event = await createDependentEvent();

    const result = await save(event, { name: "Regional corregido" });

    expect(result).toMatchObject({ status: "success" });
    await expect(readEvent(event.id)).resolves.toMatchObject({
      name: "Regional corregido",
    });
  });

  test("saves a structural edit on an event without choreographies", async () => {
    const event = await createFormSavedEvent();

    const result = await save(event, { requiredDepositPercentage: "45" });

    expect(result).toMatchObject({ status: "success" });
    await expect(readEvent(event.id)).resolves.toMatchObject({
      requiredDepositPercentage: 45,
    });
  });

  test("refuses to delete an event with choreographies", async () => {
    const event = await createDependentEvent();

    const body = new FormData();
    body.set("intent", "delete");
    body.set("confirmDeletion", event.id);

    const result = await updateAdministrativeEvent(
      await createAdminRequest(event.id, body),
      event.id,
    );

    expect(result).toMatchObject({
      status: "error",
      message: "No se puede borrar un evento con dependencias operativas.",
    });
    await expect(readEvent(event.id)).resolves.toBeDefined();
  });
});

/**
 * The form posts business dates, so an event created straight from the fixture
 * carries timestamps the form cannot express and every save would read as
 * structural. One unchanged save first leaves the row exactly as the detail
 * form writes it, which is what the guard has to be measured against.
 */
async function createFormSavedEvent() {
  const event = await createAdminSavedEvent();

  await save(event, {});

  const savedEvent = await readEvent(event.id);

  if (!savedEvent) {
    throw new Error("Expected the saved event to exist.");
  }

  return savedEvent;
}

async function createDependentEvent() {
  const event = await createFormSavedEvent();

  await createChoreographyOnNewBases({ eventId: event.id });

  return event;
}

async function readEvent(eventId: string) {
  return await db.query.events.findFirst({ where: eq(events.id, eventId) });
}

async function save(event: EventRow, changes: Partial<EventFormValues>) {
  return await updateAdministrativeEvent(
    await createAdminRequest(event.id, eventFormBody(event, changes)),
    event.id,
  );
}

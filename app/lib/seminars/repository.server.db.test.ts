import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, seminars } from "@/db/schema";
import { createSavedEvent } from "@/lib/events/bases-test-fixtures.server.db";
import {
  createSeminar,
  deleteSeminar,
  getSeminar,
  listSeminars,
  updateSeminar,
  type SeminarMutationResult,
} from "@/lib/seminars/repository.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const seminarInput = {
  instructorName: "Abril Sosa",
  scheduledDate: "2026-10-10",
  startTime: "18:30",
  quota: 20,
};

function expectSaved(result: SeminarMutationResult) {
  if (!result.ok) {
    throw new Error(`Expected the seminar to be saved: ${result.error}`);
  }

  return result.seminar;
}

describe("seminar repository", () => {
  test("creates a seminar on the event with its instructor, moment and quota", async () => {
    const event = await createSavedEvent("Regional 2026");

    const seminar = expectSaved(await createSeminar(event.id, seminarInput));

    expect(seminar).toMatchObject({
      eventId: event.id,
      instructorName: "Abril Sosa",
      instructorPictureStorageKey: null,
      scheduledDate: "2026-10-10",
      startTime: "18:30",
      quota: 20,
    });
    await expect(listSeminars(event.id)).resolves.toMatchObject([
      { id: seminar.id, availablePlaces: 20 },
    ]);
  });

  test("trims the instructor name and refuses an empty one, an invalid moment and a quota below one", async () => {
    const event = await createSavedEvent("Regional 2026");

    const seminar = expectSaved(
      await createSeminar(event.id, {
        ...seminarInput,
        instructorName: "  Abril Sosa  ",
      }),
    );
    expect(seminar.instructorName).toBe("Abril Sosa");

    await expect(
      createSeminar(event.id, { ...seminarInput, instructorName: "   " }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-seminar",
      fieldErrors: { instructorName: "Ingresá el nombre del instructor." },
    });
    await expect(
      createSeminar(event.id, { ...seminarInput, scheduledDate: "2026-13-40" }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { scheduledDate: "Este campo es obligatorio." },
    });
    await expect(
      createSeminar(event.id, { ...seminarInput, startTime: "25:00" }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { startTime: "Este campo es obligatorio." },
    });
    await expect(
      createSeminar(event.id, { ...seminarInput, quota: 0 }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { quota: "Ingresá un cupo mayor a cero." },
    });
  });

  test("refuses the same instructor at the same moment of one event on the instructor field", async () => {
    const event = await createSavedEvent("Regional 2026");
    const otherEvent = await createSavedEvent("Final 2026");

    expectSaved(await createSeminar(event.id, seminarInput));

    await expect(createSeminar(event.id, seminarInput)).resolves.toMatchObject({
      ok: false,
      code: "duplicate-seminar",
      fieldErrors: {
        instructorName:
          "Cambiá el instructor, la fecha o la hora del seminario.",
      },
    });

    // The same instructor is free at another time, and in another event.
    expectSaved(
      await createSeminar(event.id, { ...seminarInput, startTime: "20:00" }),
    );
    expectSaved(await createSeminar(otherEvent.id, seminarInput));
  });

  test("rejects a quota below one at the database", async () => {
    const event = await createSavedEvent("Regional 2026");

    await expect(
      db
        .insert(seminars)
        .values({ eventId: event.id, ...seminarInput, quota: 0 }),
    ).rejects.toThrow();
  });

  test("updates every field and keeps refusing a duplicate moment", async () => {
    const event = await createSavedEvent("Regional 2026");
    const seminar = expectSaved(await createSeminar(event.id, seminarInput));
    const other = expectSaved(
      await createSeminar(event.id, {
        ...seminarInput,
        instructorName: "Nicolás Prado",
      }),
    );

    const updated = expectSaved(
      await updateSeminar(seminar.id, {
        instructorName: "Abril Sosa Vega",
        scheduledDate: "2026-10-11",
        startTime: "09:00",
        quota: 5,
      }),
    );
    expect(updated).toMatchObject({
      instructorName: "Abril Sosa Vega",
      scheduledDate: "2026-10-11",
      startTime: "09:00",
      quota: 5,
    });

    await expect(
      updateSeminar(other.id, {
        ...seminarInput,
        instructorName: "Abril Sosa Vega",
        scheduledDate: "2026-10-11",
        startTime: "09:00",
      }),
    ).resolves.toMatchObject({ ok: false, code: "duplicate-seminar" });

    // Saving a seminar over its own moment is not a duplicate of itself.
    expectSaved(
      await updateSeminar(seminar.id, {
        instructorName: "Abril Sosa Vega",
        scheduledDate: "2026-10-11",
        startTime: "09:00",
        quota: 8,
      }),
    );
  });

  test("reports a missing seminar on read, update and delete", async () => {
    await expect(getSeminar("seminar_missing")).resolves.toBeNull();
    await expect(
      updateSeminar("seminar_missing", seminarInput),
    ).resolves.toMatchObject({ ok: false, code: "seminar-not-found" });
    await expect(deleteSeminar("seminar_missing")).resolves.toMatchObject({
      ok: false,
      code: "seminar-not-found",
    });
  });

  test("deletes a seminar and drops the rest with the event", async () => {
    const event = await createSavedEvent("Regional 2026");
    const seminar = expectSaved(await createSeminar(event.id, seminarInput));
    const survivor = expectSaved(
      await createSeminar(event.id, { ...seminarInput, startTime: "20:00" }),
    );

    await expect(deleteSeminar(seminar.id)).resolves.toEqual({ ok: true });
    await expect(listSeminars(event.id)).resolves.toMatchObject([
      { id: survivor.id },
    ]);

    await db.delete(events).where(eq(events.id, event.id));

    await expect(listSeminars(event.id)).resolves.toEqual([]);
  });
});

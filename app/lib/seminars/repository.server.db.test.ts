import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, seminarInscriptions, seminars } from "@/db/schema";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createSavedEvent } from "@/lib/events/bases-test-fixtures.server.db";
import { registerSeminarInscription } from "@/lib/seminars/inscriptions.server";
import { createAcademyUser } from "@/lib/test-support/academies";
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

  test("refuses to delete a seminar that has inscriptions, and accepts once it has none", async () => {
    const { eventId, seminarId } = await createRegistration();

    await expect(deleteSeminar(seminarId)).resolves.toMatchObject({
      ok: false,
      code: "has-inscriptions",
      error: "No se puede borrar el seminario porque tiene inscripciones.",
    });
    await expect(listSeminars(eventId)).resolves.toHaveLength(1);

    await db
      .delete(seminarInscriptions)
      .where(eq(seminarInscriptions.seminarId, seminarId));

    await expect(deleteSeminar(seminarId)).resolves.toEqual({ ok: true });
  });

  test("refuses a quota below the inscription count, naming the floor", async () => {
    const { seminarId } = await createRegistration();

    await expect(
      updateSeminar(seminarId, { ...seminarInput, quota: 0 }),
    ).resolves.toMatchObject({ ok: false, code: "invalid-seminar" });
    await expect(
      updateSeminar(seminarId, { ...seminarInput, quota: 1 }),
    ).resolves.toMatchObject({
      ok: false,
      code: "quota-below-count",
      error:
        "No se puede bajar el cupo a menos de 2: es la cantidad de inscriptos.",
    });

    // The floor is the count, not one above it, and every other field still
    // edits freely at the floor.
    expect(
      expectSaved(
        await updateSeminar(seminarId, {
          ...seminarInput,
          scheduledDate: "2020-01-01",
          startTime: "07:00",
          quota: 2,
        }),
      ),
    ).toMatchObject({ scheduledDate: "2020-01-01", quota: 2 });
  });

  test("counts the inscriptions the quota already gave away", async () => {
    const { eventId, seminarId } = await createRegistration();

    await expect(getSeminar(seminarId)).resolves.toMatchObject({
      quota: 20,
      inscriptionCount: 2,
      availablePlaces: 18,
    });
    await expect(listSeminars(eventId)).resolves.toMatchObject([
      { id: seminarId, inscriptionCount: 2 },
    ]);
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

/** A seminar with two dancers of one academy on it, before it starts. */
async function createRegistration() {
  const event = await createSavedEvent("Regional 2026");
  const seminar = expectSaved(await createSeminar(event.id, seminarInput));
  const { academy } = await createAcademyUser({
    academyName: "Academia Inscripciones",
    email: `${crypto.randomUUID()}@example.com`,
  });
  for (const firstName of ["Abril", "Beto"]) {
    const dancer = await createDancer(academy.id, {
      firstName,
      lastName: "Sosa",
    });
    const registered = await registerSeminarInscription({
      academyId: academy.id,
      eventId: event.id,
      now: new Date("2026-10-10T21:29:00.000Z"),
      personId: dancer.id,
      personKind: "dancer",
      seminarId: seminar.id,
    });

    if (!registered.ok) {
      throw new Error(`Expected the inscription: ${registered.error}`);
    }
  }

  return { eventId: event.id, seminarId: seminar.id };
}

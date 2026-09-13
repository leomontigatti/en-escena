import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

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
  type SeminarInput,
  type SeminarMutationResult,
} from "@/lib/seminars/repository.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// The seminar guards read what the money says: whether any inscription covered
// its deposit, and how many did. Both come from one module, and mocking it is
// what lets this suite state the guards without seeding a price list and a pool
// — the real readings are exercised in
// `app/lib/finances/seminar-inscription-allocation.server.db.test.ts`.
vi.mock("@/lib/seminars/covered-inscriptions.server", () => ({
  countCoveredSeminarInscriptions: vi.fn(async () => 0),
  countCoveredSeminarInscriptionsBySeminar: vi.fn(async () => new Map()),
  hasCoveredSeminarInscription: vi.fn(async () => false),
  holdsCoveredDeposit: vi.fn(async () => false),
}));

const {
  countCoveredSeminarInscriptions,
  countCoveredSeminarInscriptionsBySeminar,
  hasCoveredSeminarInscription,
} = vi.mocked(await import("@/lib/seminars/covered-inscriptions.server"));

/**
 * The gallery reads the covered count in one batched query and the detail reads
 * it one seminar at a time, so a test that stands a count up has to stand up
 * both readings of it.
 */
function stubCoveredCount(seminarId: string, coveredCount: number) {
  countCoveredSeminarInscriptions.mockResolvedValue(coveredCount);
  countCoveredSeminarInscriptionsBySeminar.mockResolvedValue(
    new Map([[seminarId, coveredCount]]),
  );
}

afterEach(() => {
  countCoveredSeminarInscriptions.mockResolvedValue(0);
  countCoveredSeminarInscriptionsBySeminar.mockResolvedValue(new Map());
  hasCoveredSeminarInscription.mockResolvedValue(false);
});

const seminarInput: SeminarInput = {
  instructorName: "Abril Sosa",
  scheduledDate: "2026-10-10",
  startTime: "18:30",
  quota: 20,
  kind: "regular",
  requiredDepositPercentage: 50,
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
        ...seminarInput,
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
        ...seminarInput,
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

  test("stores the seminar's kind and its own deposit rate, and refuses a rate outside 1 and 99", async () => {
    const event = await createSavedEvent("Regional 2026");

    const seminar = expectSaved(
      await createSeminar(event.id, {
        ...seminarInput,
        kind: "special",
        requiredDepositPercentage: 30,
      }),
    );
    expect(seminar).toMatchObject({ kind: "special" });
    expect(seminar.requiredDepositPercentage).toBe(30);

    for (const requiredDepositPercentage of [0, 100, 50.5]) {
      await expect(
        updateSeminar(seminar.id, {
          ...seminarInput,
          requiredDepositPercentage,
        }),
      ).resolves.toMatchObject({
        ok: false,
        code: "invalid-seminar",
        fieldErrors: {
          requiredDepositPercentage:
            "La seña del seminario debe ser un entero entre 1 y 99.",
        },
      });
    }
  });

  // The two facts every seminar carried before this pair existed: the row the
  // migration left behind reads as a `Común` seminar with a deposit of half its
  // price, and the database refuses a rate outside the range whichever writer
  // produced it.
  test("defaults a seminar written without the pair to regular and 50, under a database range check", async () => {
    const event = await createSavedEvent("Regional 2026");

    await db.execute(sql`
      insert into en_escena_seminar
        (id, event_id, instructor_name, scheduled_date, start_time, quota)
      values
        ('seminar_legacy', ${event.id}, 'Abril Sosa', '2026-10-10', '18:30', 20)
    `);

    await expect(getSeminar("seminar_legacy")).resolves.toMatchObject({
      kind: "regular",
      requiredDepositPercentage: 50,
    });
    await expect(
      db.execute(sql`
        update en_escena_seminar
        set required_deposit_percentage = 100
        where id = 'seminar_legacy'
      `),
    ).rejects.toThrow();
  });

  test("refuses to move the kind or the deposit rate while an inscription is covered, and lets the rest through", async () => {
    const event = await createSavedEvent("Regional 2026");
    const seminar = expectSaved(await createSeminar(event.id, seminarInput));

    hasCoveredSeminarInscription.mockResolvedValue(true);

    for (const structuralChange of [
      { kind: "special" as const },
      { requiredDepositPercentage: 40 },
    ]) {
      await expect(
        updateSeminar(seminar.id, { ...seminarInput, ...structuralChange }),
      ).resolves.toMatchObject({
        ok: false,
        code: "covered-inscriptions",
        error:
          "No se puede cambiar el tipo de seminario ni la seña: ya hay inscripciones con la seña cubierta.",
      });
    }

    // Saving the pair as it already stands is no change, so it is no refusal:
    // the instructor, the moment and the quota keep editing under money.
    expect(
      expectSaved(
        await updateSeminar(seminar.id, {
          ...seminarInput,
          instructorName: "Nicolás Prado",
        }),
      ),
    ).toMatchObject({ instructorName: "Nicolás Prado" });
  });

  // Nothing covers a deposit yet: seminar money arrives with the allocation
  // target, and until then the predicate answers `false` for every seminar, so
  // the guard above blocks nobody.
  test("moves both facts freely while no inscription is covered", async () => {
    const event = await createSavedEvent("Regional 2026");
    const seminar = expectSaved(await createSeminar(event.id, seminarInput));

    expect(
      expectSaved(
        await updateSeminar(seminar.id, {
          ...seminarInput,
          kind: "special",
          requiredDepositPercentage: 25,
        }),
      ),
    ).toMatchObject({ kind: "special", requiredDepositPercentage: 25 });
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

  test("refuses a quota below the covered count, naming the floor", async () => {
    const { seminarId } = await createRegistration();

    countCoveredSeminarInscriptions.mockResolvedValue(2);

    await expect(
      updateSeminar(seminarId, { ...seminarInput, quota: 0 }),
    ).resolves.toMatchObject({ ok: false, code: "invalid-seminar" });
    await expect(
      updateSeminar(seminarId, { ...seminarInput, quota: 1 }),
    ).resolves.toMatchObject({
      ok: false,
      code: "quota-below-covered",
      error:
        "No se puede bajar el cupo a menos de 2: es la cantidad de inscripciones con la seña cubierta.",
    });

    // The floor is the covered count, not one above it, and every other field
    // still edits freely at the floor.
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

  // Registration is unlimited, so the floor ignores it: two people on the
  // roster who covered nothing hold no place, and the quota drops under them.
  test("ignores the uncovered inscriptions and lets the quota be raised freely", async () => {
    const { seminarId } = await createRegistration();

    expect(
      expectSaved(
        await updateSeminar(seminarId, { ...seminarInput, quota: 1 }),
      ),
    ).toMatchObject({ quota: 1 });
    expect(
      expectSaved(
        await updateSeminar(seminarId, { ...seminarInput, quota: 50 }),
      ),
    ).toMatchObject({ quota: 50 });
  });

  test("reads the places off the covered count and the roster off the inscriptions", async () => {
    const { eventId, seminarId } = await createRegistration();

    stubCoveredCount(seminarId, 1);

    await expect(getSeminar(seminarId)).resolves.toMatchObject({
      quota: 20,
      registeredCount: 2,
      inscriptionCount: 2,
      availablePlaces: 19,
    });
    await expect(listSeminars(eventId)).resolves.toMatchObject([
      { id: seminarId, availablePlaces: 19, registeredCount: 2 },
    ]);
  });

  // The delete guard refuses on every row, withdrawn included, so the count the
  // dialog blocks on has to see what the roster does not.
  test("keeps a withdrawn row out of the roster count and in the inscription count", async () => {
    const { eventId, seminarId } = await createRegistration();

    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: new Date("2026-10-01T12:00:00.000Z") })
      .where(eq(seminarInscriptions.seminarId, seminarId));

    for (const seminar of [
      await getSeminar(seminarId),
      ...(await listSeminars(eventId)),
    ]) {
      expect(seminar).toMatchObject({
        registeredCount: 0,
        inscriptionCount: 2,
      });
    }

    await expect(deleteSeminar(seminarId)).resolves.toMatchObject({
      ok: false,
      code: "has-inscriptions",
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

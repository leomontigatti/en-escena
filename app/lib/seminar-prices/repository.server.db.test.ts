import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, seminarInscriptions } from "@/db/schema";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createSavedEvent } from "@/lib/events/bases-test-fixtures.server.db";
import {
  uncoveredSeminarPriceDeleteError,
  uncoveredSeminarPriceUpdateError,
} from "@/lib/seminar-prices/guard-messages";
import {
  createSeminarPrice,
  deleteSeminarPrice,
  hasSeminarRegistrationPrices,
  listSeminarPrices,
  updateSeminarPrice,
  type SeminarPriceInput,
  type SeminarPriceRow,
} from "@/lib/seminar-prices/repository.server";
import { registerSeminarInscription } from "@/lib/seminars/inscriptions.server";
import { createSeminar } from "@/lib/seminars/repository.server";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const frozenUpdateError =
  "No se pueden editar monto, tipo de seminario, participantes ni fecha límite porque hay inscripciones que congelaron este precio.";
const frozenDeleteError =
  "No se puede borrar el precio porque hay inscripciones que congelaron este precio.";

const participantTail: SeminarPriceInput = {
  name: "Precio participantes",
  kind: "regular",
  forParticipants: true,
  paymentDeadline: null,
  amount: 20000,
};
const outsiderTail: SeminarPriceInput = {
  ...participantTail,
  name: "Precio no participantes",
  forParticipants: false,
  amount: 30000,
};

describe("seminar price repository", () => {
  test("keeps one row per kind, participant cell and deadline, with two absent deadlines colliding", async () => {
    const event = await createSavedEvent("Regional 2026");

    const tail = expectSavedPrice(
      await createSeminarPrice(event.id, participantTail),
    );

    expect(tail).toMatchObject({
      eventId: event.id,
      name: "Precio participantes",
      kind: "regular",
      forParticipants: true,
      paymentDeadline: null,
      amount: 20000,
    });
    // The same cell without a deadline is the same row: the unique index is
    // created `NULLS NOT DISTINCT`, so a second tail cannot slip in.
    await expect(
      createSeminarPrice(event.id, {
        ...participantTail,
        name: "Otro precio",
        amount: 25000,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "duplicate-name",
      error:
        "Ya existe un precio de seminario para ese tipo, esas personas y esa fecha límite.",
    });
    // The other half of the participant axis, the other kind and a dated row of
    // the same cell are all different rows.
    await expect(
      createSeminarPrice(event.id, outsiderTail),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createSeminarPrice(event.id, {
        ...participantTail,
        name: "Precio exclusivo",
        kind: "special",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createSeminarPrice(event.id, {
        ...participantTail,
        name: "Precio primera fecha",
        paymentDeadline: "2026-06-30",
        amount: 18000,
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  test("refuses an empty name, a malformed deadline and an amount below one", async () => {
    const event = await createSavedEvent("Regional 2026");

    await expect(
      createSeminarPrice(event.id, {
        ...participantTail,
        name: "  ",
        amount: 0,
        paymentDeadline: "30/06/2026",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-event-bases",
      fieldErrors: {
        name: "Ingresá el nombre del precio.",
        amount: "Ingresá un monto mayor a cero.",
        paymentDeadline: "Elegí una fecha válida.",
      },
    });
    await expect(
      createSeminarPrice(event.id, { ...participantTail, kind: "premium" }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { kind: "Elegí un tipo de seminario." },
    });
  });

  test("freezes a referenced row except for its name", async () => {
    const { event, inscriptionId } = await createSeminarInscriptionFixture();
    const dated = expectSavedPrice(
      await createSeminarPrice(event.id, {
        ...participantTail,
        name: "Precio primera fecha",
        paymentDeadline: "2026-06-30",
        amount: 18000,
      }),
    );

    await db
      .update(seminarInscriptions)
      .set({ selectedPriceId: dated.id })
      .where(eq(seminarInscriptions.id, inscriptionId));

    for (const structuralChange of [
      { amount: 19000 },
      { kind: "special" },
      { forParticipants: false },
      { paymentDeadline: "2026-07-31" },
    ]) {
      await expect(
        updateSeminarPrice(dated.id, {
          ...participantTail,
          name: "Precio primera fecha",
          paymentDeadline: "2026-06-30",
          amount: 18000,
          ...structuralChange,
        }),
      ).resolves.toMatchObject({ ok: false, error: frozenUpdateError });
    }

    await expect(deleteSeminarPrice(dated.id)).resolves.toMatchObject({
      ok: false,
      error: frozenDeleteError,
    });
    // The name is a label: it never moves what anyone is charged.
    await expect(
      updateSeminarPrice(dated.id, {
        ...participantTail,
        name: "Precio de mayo",
        paymentDeadline: "2026-06-30",
        amount: 18000,
      }),
    ).resolves.toMatchObject({
      ok: true,
      record: { name: "Precio de mayo" },
    });
  });

  test("protects the deadline-less regular row of a cell while the event has seminar inscriptions", async () => {
    const { event } = await createSeminarInscriptionFixture();
    const tail = expectSavedPrice(
      await createSeminarPrice(event.id, participantTail),
    );
    // A dated row that has not expired: the path resolves today, so a
    // date-relative check would let the tail go.
    await createSeminarPrice(event.id, {
      ...participantTail,
      name: "Precio primera fecha",
      paymentDeadline: "2099-12-31",
      amount: 18000,
    });

    await expect(deleteSeminarPrice(tail.id)).resolves.toMatchObject({
      ok: false,
      code: "event-bases-has-dependencies",
      error: uncoveredSeminarPriceDeleteError(true),
    });

    for (const restructuring of [
      { paymentDeadline: "2099-06-30" },
      { kind: "special" as const },
      { forParticipants: false },
    ]) {
      await expect(
        updateSeminarPrice(tail.id, { ...participantTail, ...restructuring }),
      ).resolves.toMatchObject({
        ok: false,
        error: uncoveredSeminarPriceUpdateError(true),
      });
    }

    // Repricing the tail is not a coverage question.
    await expect(
      updateSeminarPrice(tail.id, {
        ...participantTail,
        name: "Precio participantes",
        amount: 21000,
      }),
    ).resolves.toMatchObject({ ok: true, record: { amount: 21000 } });
  });

  test("lets the tail go when the event has no seminar inscription", async () => {
    const event = await createSavedEvent("Regional 2026");
    const tail = expectSavedPrice(
      await createSeminarPrice(event.id, participantTail),
    );

    await expect(deleteSeminarPrice(tail.id)).resolves.toMatchObject({
      ok: true,
    });
  });

  test("reads registration prices as complete only when both participant cells carry their regular tail", async () => {
    const event = await createSavedEvent("Regional 2026");

    await expect(hasSeminarRegistrationPrices(event.id)).resolves.toBe(false);

    await createSeminarPrice(event.id, participantTail);
    // A `special` row does not cover a cell: resolution falls back to the
    // `regular` rows, never the other way round.
    await createSeminarPrice(event.id, {
      ...outsiderTail,
      name: "Precio exclusivo",
      kind: "special",
    });

    await expect(hasSeminarRegistrationPrices(event.id)).resolves.toBe(false);

    await createSeminarPrice(event.id, outsiderTail);

    await expect(hasSeminarRegistrationPrices(event.id)).resolves.toBe(true);
  });

  test("reports on each listed row what the guards would refuse", async () => {
    const { event, inscriptionId } = await createSeminarInscriptionFixture();
    const tail = expectSavedPrice(
      await createSeminarPrice(event.id, participantTail),
    );
    const dated = expectSavedPrice(
      await createSeminarPrice(event.id, {
        ...participantTail,
        name: "Precio primera fecha",
        paymentDeadline: "2026-06-30",
        amount: 18000,
      }),
    );

    await db
      .update(seminarInscriptions)
      .set({ selectedPriceId: dated.id })
      .where(eq(seminarInscriptions.id, inscriptionId));

    const rows = await listSeminarPrices(event.id);

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: tail.id,
          isReferenced: false,
          keepsRegistrationOpen: true,
        }),
        expect.objectContaining({
          id: dated.id,
          isReferenced: true,
          keepsRegistrationOpen: false,
        }),
      ]),
    );
  });

  test("takes the event's prices with it when the event is deleted", async () => {
    const event = await createSavedEvent("Regional 2026");
    await createSeminarPrice(event.id, participantTail);
    await expect(listSeminarPrices(event.id)).resolves.toHaveLength(1);

    await db.delete(events).where(eq(events.id, event.id));

    await expect(listSeminarPrices(event.id)).resolves.toEqual([]);
  });
});

function expectSavedPrice(
  result: Awaited<ReturnType<typeof createSeminarPrice>>,
): SeminarPriceRow {
  if (!result.ok) {
    throw new Error(`Expected the seminar price to be saved: ${result.error}`);
  }

  return result.record as SeminarPriceRow;
}

/** An event with one seminar and one inscription on it, before it starts. */
async function createSeminarInscriptionFixture() {
  const event = await createSavedEvent("Regional 2026");
  const seminar = await createSeminar(event.id, {
    instructorName: "Abril Sosa",
    scheduledDate: "2026-10-10",
    startTime: "18:30",
    quota: 20,
    kind: "regular",
    requiredDepositPercentage: 50,
  });

  if (!seminar.ok) {
    throw new Error(`Expected the seminar: ${seminar.error}`);
  }

  const { academy } = await createAcademyUser({
    academyName: "Academia Precios",
    email: `${crypto.randomUUID()}@example.com`,
  });
  const dancer = await createDancer(academy.id, {
    firstName: "Abril",
    lastName: "Sosa",
  });
  const registered = await registerSeminarInscription({
    academyId: academy.id,
    eventId: event.id,
    now: new Date("2026-10-10T21:29:00.000Z"),
    personId: dancer.id,
    personKind: "dancer",
    seminarId: seminar.seminar.id,
  });

  if (!registered.ok) {
    throw new Error(`Expected the inscription: ${registered.error}`);
  }

  return {
    event,
    seminar: seminar.seminar,
    inscriptionId: registered.inscriptionId,
  };
}

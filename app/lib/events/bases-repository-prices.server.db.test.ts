import { describe, expect, test } from "vitest";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { choreographyDancers, prices } from "@/db/schema";
import { createSelectedPriceInscriptionForTest } from "@/features/portal/choreographies/test-support/db";
import { createModality } from "@/lib/modalities/repository.server";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import {
  createPrice,
  deletePrice,
  listPrices,
  resolveApplicablePrice,
  updatePrice,
} from "@/lib/prices/repository.server";
import { deleteSchedule } from "@/lib/schedules/repository.server";
import {
  createEventPriceFixture,
  createSavedEvent,
  createSavedPrice,
  createSavedSchedule,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`Bases del evento` repository", () => {
  test("keeps prices unique by event and rejects schedules from another event", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");
    const jazz = await expectCreated(
      createModality(firstEvent.id, { name: "Jazz" }),
    );
    const otherEventModality = await expectCreated(
      createModality(secondEvent.id, { name: "Jazz" }),
    );
    const block = await createSavedSchedule(firstEvent.id, {
      modalityIds: [jazz.id],
    });
    const otherEventBlock = await createSavedSchedule(secondEvent.id, {
      modalityIds: [otherEventModality.id],
      scheduledDate: "2026-06-02",
      startTime: "11:00",
      totalCapacity: 10,
    });

    await createSavedPrice(firstEvent.id);
    await createSavedPrice(firstEvent.id, {
      amount: 15000,
      name: "Precio bloque",
      scheduleId: block.id,
    });
    await expect(deleteSchedule(block.id)).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el cronograma porque tiene dependencias.",
    });
    await expect(
      createPrice(secondEvent.id, {
        groupType: "solo",
        amount: 9000,
        paymentDeadline: "2026-06-30",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createPrice(firstEvent.id, {
        groupType: "solo",
        amount: 13000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe un precio general para ese tipo de grupo.",
      fieldErrors: { groupType: "Revisá el tipo de grupo del precio." },
    });
    await expect(
      createPrice(firstEvent.id, {
        groupType: "solo",
        amount: 13000,
        paymentDeadline: "2026-05-31",
        scheduleId: otherEventBlock.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Elegí un cronograma del evento activo.",
      fieldErrors: {
        scheduleId: "Elegí un cronograma del evento activo.",
      },
    });
  });

  test("resolves the applicable price by schedule specificity and payment deadline", async () => {
    const { event, schedule: block } = await createEventPriceFixture();
    const general = await createSavedPrice(event.id);
    const specific = await createSavedPrice(event.id, {
      amount: 15000,
      name: "Precio bloque",
      scheduleId: block.id,
    });
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "solo",
        scheduleId: block.id,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: specific.id, amount: 15000 },
    });
    const laterGeneral = await createSavedPrice(event.id, {
      amount: 17000,
      name: "Precio segunda fecha",
      paymentDeadline: "2026-06-30",
    });
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "solo",
        paymentDate: "2026-06-10",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: laterGeneral.id, amount: 17000 },
    });
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "solo",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: general.id, amount: 12000 },
    });
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "duo",
        scheduleId: block.id,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "missing-price",
      error:
        "No hay un precio configurado para este tipo de grupo y cronograma.",
    });
  });

  test("keeps one open-ended price per tier and rejects a second one in the database", async () => {
    const { event, schedule: block } = await createEventPriceFixture();
    await createSavedPrice(event.id, {
      amount: 20000,
      name: "Precio base general",
      paymentDeadline: null,
    });
    await createSavedPrice(event.id, {
      amount: 25000,
      name: "Precio base del cronograma",
      paymentDeadline: null,
      scheduleId: block.id,
    });

    await expect(listPrices(event.id)).resolves.toMatchObject([
      { name: "Precio base del cronograma", paymentDeadline: null },
      { name: "Precio base general", paymentDeadline: null },
    ]);
    await expect(
      createPrice(event.id, {
        groupType: "solo",
        amount: 30000,
        paymentDeadline: null,
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe un precio general para ese tipo de grupo.",
    });

    // `price_general_unique` and `price_specific_unique` are the last word:
    // without `NULLS NOT DISTINCT` Postgres reads two null deadlines as
    // distinct and lets both rows in behind the repository check.
    await expect(
      db.insert(prices).values({
        eventId: event.id,
        name: "Segundo precio base general",
        groupType: "solo",
        amount: 30000,
        paymentDeadline: null,
        scheduleId: null,
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: "price_general_unique" },
    });
    await expect(
      db.insert(prices).values({
        eventId: event.id,
        name: "Segundo precio base del cronograma",
        groupType: "solo",
        amount: 30000,
        paymentDeadline: null,
        scheduleId: block.id,
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: "price_specific_unique" },
    });
  });

  // The clause lives only in migration 0015's hand-written SQL: Drizzle can
  // express `NULLS NOT DISTINCT` on a `unique()` constraint but not on an
  // index, and both of these are partial, so the TypeScript schema and the
  // snapshot cannot carry it. That leaves it invisible to `drizzle-kit
  // generate`, which would drop it without a word if it ever recreated these
  // indexes. This asserts the clause itself rather than its effect, so the
  // regression surfaces here instead of as a silently duplicated open-ended price.
  test("keeps `NULLS NOT DISTINCT` on both price unique indexes", async () => {
    const indexes = await db.execute<{
      indexname: string;
      nulls_not_distinct: boolean;
    }>(sql`
      select
        pg_class.relname as indexname,
        pg_index.indnullsnotdistinct as nulls_not_distinct
      from pg_index
      join pg_class on pg_class.oid = pg_index.indexrelid
      where pg_class.relname in ('price_general_unique', 'price_specific_unique')
      order by pg_class.relname
    `);

    expect(readRows(indexes)).toEqual([
      { indexname: "price_general_unique", nulls_not_distinct: true },
      { indexname: "price_specific_unique", nulls_not_distinct: true },
    ]);
  });

  test("falls back to the open-ended price only once every dated row has expired", async () => {
    const { event, schedule: block } = await createEventPriceFixture();
    const dated = await createSavedPrice(event.id, {
      amount: 12000,
      paymentDeadline: "2026-05-31",
    });
    const generalBase = await createSavedPrice(event.id, {
      amount: 20000,
      name: "Precio base general",
      paymentDeadline: null,
    });
    const datedBlock = await createSavedPrice(event.id, {
      amount: 15000,
      name: "Precio bloque",
      paymentDeadline: "2026-05-31",
      scheduleId: block.id,
    });

    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "solo",
        paymentDate: "2026-05-20",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({ ok: true, price: { id: dated.id } });
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "solo",
        paymentDate: "2026-06-01",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({ ok: true, price: { id: generalBase.id } });

    // Two tiers: the schedule's own row still applies, and once it expires the
    // resolution falls through to the general tier's open-ended price rather than to
    // `missing-price`.
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "solo",
        paymentDate: "2026-05-20",
        scheduleId: block.id,
      }),
    ).resolves.toMatchObject({ ok: true, price: { id: datedBlock.id } });
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "solo",
        paymentDate: "2026-06-01",
        scheduleId: block.id,
      }),
    ).resolves.toMatchObject({ ok: true, price: { id: generalBase.id } });
  });

  test("lists prices with schedule scope and blocks dependent updates and deletes", async () => {
    const { event, schedule: block } = await createEventPriceFixture();
    const general = await createSavedPrice(event.id);
    await createSavedPrice(event.id, {
      amount: 15000,
      name: "Precio bloque",
      scheduleId: block.id,
    });
    await createSavedPrice(event.id, {
      amount: 17000,
      name: "Precio segunda fecha",
      paymentDeadline: "2026-06-30",
    });

    await expect(listPrices(event.id)).resolves.toMatchObject([
      {
        eventId: event.id,
        paymentDeadline: "2026-05-31",
        schedule: { name: "Sábado Mañana" },
      },
      {
        eventId: event.id,
        paymentDeadline: "2026-05-31",
        schedule: null,
      },
      {
        eventId: event.id,
        paymentDeadline: "2026-06-30",
        schedule: null,
      },
    ]);

    await expect(
      updatePrice(
        general.id,
        {
          groupType: "solo",
          amount: 12000,
          paymentDeadline: "2026-05-31",
          scheduleId: null,
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: true,
      record: { amount: 12000 },
    });
    await expect(
      updatePrice(
        general.id,
        {
          groupType: "solo",
          amount: 14000,
          paymentDeadline: "2026-05-31",
          scheduleId: null,
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar monto, tipo de grupo, vencimiento ni cronograma porque hay inscripciones que congelaron este precio.",
    });
    await expect(
      deletePrice(general.id, { hasDependencies: async () => true }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar el precio porque hay inscripciones que congelaron este precio.",
    });
  });

  test("blocks structural price changes and deletion when an inscription froze the price", async () => {
    const event = await createSavedEvent("Regional 2026", { activate: true });
    const { academy, choreography } =
      await createAcademyFinanceChoreographyFixture({
        academyName: "Academia Precio Congelado",
        choreographyName: "Coreografía Congelada",
        email: "academia.precio.congelado@example.com",
        event,
      });
    const price = await db.query.prices.findFirst({
      where: eq(prices.eventId, event.id),
    });

    if (!price) {
      throw new Error("Expected seeded price fixture.");
    }

    await createSelectedPriceInscriptionForTest({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      selectedPriceId: price.id,
    });

    await expect(
      updatePrice(price.id, {
        amount: 12000,
        groupType: "solo",
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar monto, tipo de grupo, vencimiento ni cronograma porque hay inscripciones que congelaron este precio.",
    });
    await expect(deletePrice(price.id)).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar el precio porque hay inscripciones que congelaron este precio.",
    });
  });

  test("keeps mutating a dated rung open while the group type keeps its open-ended price", async () => {
    const { event, catalog, datedRung } = await createCoveredPathFixture({
      academyName: "Academia Escalera",
      choreographyName: "Coreografía Escalera",
      email: "academia.escalera@example.com",
      eventName: "Regional 2031",
    });

    await expect(deletePrice(datedRung.id)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      createPrice(event.id, {
        groupType: "solo",
        amount: 30000,
        paymentDeadline: null,
        scheduleId: catalog.schedule.id,
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  test("refuses to remove the open-ended price of a group type with active inscriptions", async () => {
    const { openEnded } = await createCoveredPathFixture({
      academyName: "Academia Sin Fecha",
      choreographyName: "Coreografía Sin Fecha",
      email: "academia.sin.fecha@example.com",
      eventName: "Regional 2032",
      // A dated rung that has not expired: the path resolves today, so a
      // date-relative check would let the tail go.
      liveRungDeadline: "2099-12-31",
    });

    await expect(deletePrice(openEnded.id)).resolves.toMatchObject({
      ok: false,
      code: "event-bases-has-dependencies",
      error: uncoveredDeleteError,
    });
  });

  test("refuses to date, re-point or re-type the open-ended price of a group type with active inscriptions", async () => {
    const { catalog, openEnded } = await createCoveredPathFixture({
      academyName: "Academia Vencimiento",
      choreographyName: "Coreografía Vencimiento",
      email: "academia.vencimiento@example.com",
      eventName: "Regional 2033",
      liveRungDeadline: "2099-12-31",
    });
    const uncoveredUpdate = {
      ok: false,
      code: "event-bases-has-dependencies",
      error: uncoveredUpdateError,
    };

    await expect(
      updatePrice(openEnded.id, {
        groupType: "solo",
        amount: 20000,
        paymentDeadline: "2099-06-30",
        scheduleId: null,
      }),
    ).resolves.toMatchObject(uncoveredUpdate);
    await expect(
      updatePrice(openEnded.id, {
        groupType: "solo",
        amount: 20000,
        paymentDeadline: null,
        scheduleId: catalog.schedule.id,
      }),
    ).resolves.toMatchObject(uncoveredUpdate);
    await expect(
      updatePrice(openEnded.id, {
        groupType: "duo",
        amount: 20000,
        paymentDeadline: null,
        scheduleId: null,
      }),
    ).resolves.toMatchObject(uncoveredUpdate);

    // The amount is not a coverage question: the row stays open-ended and
    // general, so the edit goes through.
    await expect(
      updatePrice(openEnded.id, {
        groupType: "solo",
        amount: 21000,
        paymentDeadline: null,
        scheduleId: null,
      }),
    ).resolves.toMatchObject({ ok: true, record: { amount: 21000 } });
  });

  test("lets the schedule tier lose its open-ended price even when the general tier is uncovered", async () => {
    const { catalog, event, openEnded } = await createCoveredPathFixture({
      academyName: "Academia Cronograma",
      choreographyName: "Coreografía Cronograma",
      email: "academia.cronograma@example.com",
      eventName: "Regional 2034",
    });
    const scheduleOpenEnded = await createSavedPrice(event.id, {
      amount: 25000,
      name: "Sin fecha límite - Bloque",
      paymentDeadline: null,
      scheduleId: catalog.schedule.id,
    });

    // The general tail goes out of band, so the guard's `scheduleId` exit is
    // the only thing left permitting the delete below. Without it the test
    // would pass on a general-tier coverage check it is not meant to assert.
    await db.delete(prices).where(eq(prices.id, openEnded.id));

    await expect(deletePrice(scheduleOpenEnded.id)).resolves.toMatchObject({
      ok: true,
    });
  });

  test("does not refuse mutations on a group type that already has no open-ended price", async () => {
    const { datedRung, openEnded } = await createCoveredPathFixture({
      academyName: "Academia Sin Cola",
      choreographyName: "Coreografía Sin Cola",
      email: "academia.sin.cola@example.com",
      eventName: "Regional 2035",
    });

    // The gap is pre-existing, not this mutation's doing: `solo` carries an
    // active inscription and has lost its tail out of band. Mutating what is
    // left must stay possible, or the admin is trapped on an event they cannot
    // repair. The last delete empties the path entirely and still succeeds.
    await db.delete(prices).where(eq(prices.id, openEnded.id));

    await expect(
      updatePrice(datedRung.id, {
        groupType: "duo",
        amount: 10000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(deletePrice(datedRung.id)).resolves.toMatchObject({
      ok: true,
    });
    await expect(listPrices(datedRung.eventId)).resolves.toEqual([]);
  });

  test("ignores withdrawn inscriptions when guarding the open-ended price", async () => {
    const { inscription, openEnded } = await createCoveredPathFixture({
      academyName: "Academia Baja",
      choreographyName: "Coreografía Baja",
      email: "academia.baja@example.com",
      eventName: "Regional 2036",
    });

    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: new Date("2026-04-01T12:00:00Z") })
      .where(eq(choreographyDancers.id, inscription.id));

    await expect(deletePrice(openEnded.id)).resolves.toMatchObject({
      ok: true,
    });
  });

  test("refuses the open-ended price of a fully frozen group type without claiming its inscriptions read it", async () => {
    const { datedRung, inscription, openEnded } =
      await createCoveredPathFixture({
        academyName: "Academia Congelada Entera",
        choreographyName: "Coreografía Congelada Entera",
        email: "academia.congelada.entera@example.com",
        eventName: "Regional 2038",
      });

    // Every active inscription of `solo` now reads its own stored row, so none
    // of them depends on the tail. The refusal is still right — the roster
    // admin path skips the readiness gate, so a later un-frozen inscription
    // could land on an uncovered path — but the copy must not assert a
    // dependency that is not there.
    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: datedRung.id })
      .where(eq(choreographyDancers.id, inscription.id));

    await expect(deletePrice(openEnded.id)).resolves.toMatchObject({
      ok: false,
      code: "event-bases-has-dependencies",
      error: uncoveredDeleteError,
    });
    await expect(
      updatePrice(openEnded.id, {
        groupType: "solo",
        amount: 20000,
        paymentDeadline: "2099-12-31",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "event-bases-has-dependencies",
      error: uncoveredUpdateError,
    });
    // What the update message points at: repricing the tail stays open.
    await expect(
      updatePrice(openEnded.id, {
        groupType: "solo",
        amount: 26000,
        paymentDeadline: null,
        scheduleId: null,
      }),
    ).resolves.toMatchObject({ ok: true, record: { amount: 26000 } });
  });

  test("keeps blocking a frozen price even when the group type keeps its open-ended price", async () => {
    const { academy, choreography, datedRung } = await createCoveredPathFixture(
      {
        academyName: "Academia Congelada Cubierta",
        choreographyName: "Coreografía Congelada Cubierta",
        email: "academia.congelada.cubierta@example.com",
        eventName: "Regional 2037",
      },
    );

    await createSelectedPriceInscriptionForTest({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      selectedPriceId: datedRung.id,
    });

    await expect(
      updatePrice(datedRung.id, {
        groupType: "solo",
        amount: 11000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: frozenUpdateError,
    });
    await expect(deletePrice(datedRung.id)).resolves.toMatchObject({
      ok: false,
      error: frozenDeleteError,
    });
  });

  test("ignores inscriptions that did not freeze the price when changing it", async () => {
    const event = await createSavedEvent("Regional 2027", { activate: true });
    const { academy, choreography } =
      await createAcademyFinanceChoreographyFixture({
        academyName: "Academia Precio Sin Congelar",
        choreographyName: "Coreografía Sin Congelar",
        email: "academia.precio.sin.congelar@example.com",
        event,
      });
    const price = await db.query.prices.findFirst({
      where: eq(prices.eventId, event.id),
    });

    if (!price) {
      throw new Error("Expected seeded price fixture.");
    }

    await createSelectedPriceInscriptionForTest({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      selectedPriceId: null,
    });

    await expect(
      updatePrice(price.id, {
        amount: 12000,
        groupType: "solo",
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      record: { amount: 12000 },
    });
    await expect(deletePrice(price.id)).resolves.toMatchObject({
      ok: true,
    });
  });
});

const frozenUpdateError =
  "No se pueden editar monto, tipo de grupo, vencimiento ni cronograma porque hay inscripciones que congelaron este precio.";
const frozenDeleteError =
  "No se puede borrar el precio porque hay inscripciones que congelaron este precio.";
const uncoveredUpdateError =
  "No se puede editar el precio porque es el único sin fecha límite de ese tipo de grupo, que tiene inscripciones activas. Podés cambiarle el monto.";
const uncoveredDeleteError =
  "No se puede borrar el precio porque es el único sin fecha límite de ese tipo de grupo, que tiene inscripciones activas.";

// A `solo` path with one active un-frozen inscription: the state the guard has
// to see. The catalog seeds the dated rung, and the open-ended row is the tail
// the coverage guard protects.
async function createCoveredPathFixture(input: {
  academyName: string;
  choreographyName: string;
  email: string;
  eventName: string;
  liveRungDeadline?: string;
}) {
  const event = await createSavedEvent(input.eventName, { activate: true });
  const { academy, catalog, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: input.academyName,
      choreographyName: input.choreographyName,
      email: input.email,
      event,
    });
  const datedRung = await db.query.prices.findFirst({
    where: eq(prices.eventId, event.id),
  });

  if (!datedRung) {
    throw new Error("Expected seeded price fixture.");
  }

  if (input.liveRungDeadline) {
    await createSavedPrice(event.id, {
      amount: 18000,
      name: "Segunda fecha",
      paymentDeadline: input.liveRungDeadline,
    });
  }

  const openEnded = await createSavedPrice(event.id, {
    amount: 20000,
    name: "Sin fecha límite",
    paymentDeadline: null,
  });
  const inscription = await createSelectedPriceInscriptionForTest({
    academyId: academy.academy.id,
    choreographyId: choreography.id,
    selectedPriceId: null,
  });

  return {
    academy,
    catalog,
    choreography,
    datedRung,
    event,
    inscription,
    openEnded,
  };
}

// `db.execute` hands back a bare array on postgres.js and a `{ rows }` envelope
// on PGlite, which is what the fast config runs. Same shape as the helper in
// `tests/db/schema-security.db.test.ts`.
function readRows<Row extends object>(result: { rows: Row[] } | Row[]) {
  return Array.isArray(result) ? result : result.rows;
}

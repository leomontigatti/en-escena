import { afterEach, describe, expect, test, vi } from "vitest";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { choreographyDancers, prices } from "@/db/schema";
import { createSelectedPriceInscriptionForTest } from "@/features/portal/choreographies/test-support/db";
import { createModality } from "@/lib/modalities/repository.server";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import { resolveApplicableInscriptionPrice } from "@/lib/finances/inscription-price.server";
import {
  createPrice,
  deletePrice,
  listPrices,
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

import { insertTestPrice } from "@/lib/prices/price-rows.test-support";
import { onBusinessDate } from "@/lib/shared/business-time-zone.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// A schedule the event has no price row for. Every choreography has a schedule,
// so the fall-through to the general tier is what a schedule with no row of its
// own gets, not what a caller with no schedule gets.
const SCHEDULE_WITHOUT_ROW = "schedule-without-price-row";

afterEach(() => {
  vi.restoreAllMocks();
});

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
      scheduleIds: [block.id],
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
        scheduleIds: [],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createPrice(firstEvent.id, {
        groupType: "solo",
        amount: 13000,
        paymentDeadline: "2026-05-31",
        scheduleIds: [],
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
        scheduleIds: [otherEventBlock.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Elegí cronogramas del evento activo.",
      fieldErrors: {
        scheduleIds: "Elegí cronogramas del evento activo.",
      },
    });
  });

  test("resolves the applicable price by schedule specificity and payment deadline", async () => {
    const { event, schedule: block } = await createEventPriceFixture();
    const general = await createSavedPrice(event.id);
    const specific = await createSavedPrice(event.id, {
      amount: 15000,
      name: "Precio bloque",
      scheduleIds: [block.id],
    });
    // Every fixture row expires on 2026-05-31; the resolver has no date of its
    // own, so the business date is what the test moves.
    onBusinessDate("2026-05-20");
    await expect(
      resolveApplicableInscriptionPrice(db, {
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
    onBusinessDate("2026-06-10");
    await expect(
      resolveApplicableInscriptionPrice(db, {
        eventId: event.id,
        groupType: "solo",
        scheduleId: SCHEDULE_WITHOUT_ROW,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: laterGeneral.id, amount: 17000 },
    });
    // Both general rows apply again, and the nearest deadline wins.
    onBusinessDate("2026-05-20");
    await expect(
      resolveApplicableInscriptionPrice(db, {
        eventId: event.id,
        groupType: "solo",
        scheduleId: SCHEDULE_WITHOUT_ROW,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: general.id, amount: 12000 },
    });
    await expect(
      resolveApplicableInscriptionPrice(db, {
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
      scheduleIds: [block.id],
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
        scheduleIds: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe un precio general para ese tipo de grupo.",
    });

    // `price_general_unique` and `price_schedule_tier_unique` are the last
    // word: without `NULLS NOT DISTINCT` Postgres reads two null deadlines as
    // distinct and lets both rows in behind the repository check.
    await expect(
      insertTestPrice({
        eventId: event.id,
        name: "Segundo precio base general",
        groupType: "solo",
        amount: 30000,
        paymentDeadline: null,
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: "price_general_unique" },
    });
    await expect(
      insertTestPrice({
        eventId: event.id,
        name: "Segundo precio base del cronograma",
        groupType: "solo",
        amount: 30000,
        paymentDeadline: null,
        scheduleIds: [block.id],
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: "price_schedule_tier_unique" },
    });
  });

  // On the general index the clause lives only in migration 0036's
  // hand-written SQL: Drizzle can express `NULLS NOT DISTINCT` on a `unique()`
  // constraint but not on an index, and this one is partial, so the TypeScript
  // schema and the snapshot cannot carry it. That leaves it invisible to
  // `drizzle-kit generate`, which would drop it without a word if it ever
  // recreated the index. This asserts the clause itself rather than its effect,
  // so the regression surfaces here instead of as a silently duplicated
  // open-ended price. The schedule tier's constraint is a `unique()` and
  // carries the clause in the schema, but is asserted alongside.
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
      where pg_class.relname in ('price_general_unique', 'price_schedule_tier_unique')
      order by pg_class.relname
    `);

    expect(readRows(indexes)).toEqual([
      { indexname: "price_general_unique", nulls_not_distinct: true },
      { indexname: "price_schedule_tier_unique", nulls_not_distinct: true },
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
      scheduleIds: [block.id],
    });

    onBusinessDate("2026-05-20");
    await expect(
      resolveApplicableInscriptionPrice(db, {
        eventId: event.id,
        groupType: "solo",
        scheduleId: SCHEDULE_WITHOUT_ROW,
      }),
    ).resolves.toMatchObject({ ok: true, price: { id: dated.id } });
    onBusinessDate("2026-06-01");
    await expect(
      resolveApplicableInscriptionPrice(db, {
        eventId: event.id,
        groupType: "solo",
        scheduleId: SCHEDULE_WITHOUT_ROW,
      }),
    ).resolves.toMatchObject({ ok: true, price: { id: generalBase.id } });

    // Two tiers: the schedule's own row still applies, and once it expires the
    // resolution falls through to the general tier's open-ended price rather than to
    // `missing-price`.
    onBusinessDate("2026-05-20");
    await expect(
      resolveApplicableInscriptionPrice(db, {
        eventId: event.id,
        groupType: "solo",
        scheduleId: block.id,
      }),
    ).resolves.toMatchObject({ ok: true, price: { id: datedBlock.id } });
    onBusinessDate("2026-06-01");
    await expect(
      resolveApplicableInscriptionPrice(db, {
        eventId: event.id,
        groupType: "solo",
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
      scheduleIds: [block.id],
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
        schedules: [{ name: "Sábado Mañana" }],
      },
      {
        eventId: event.id,
        paymentDeadline: "2026-05-31",
        schedules: [],
      },
      {
        eventId: event.id,
        paymentDeadline: "2026-06-30",
        schedules: [],
      },
    ]);

    await expect(
      updatePrice(
        general.id,
        {
          groupType: "solo",
          amount: 12000,
          paymentDeadline: "2026-05-31",
          scheduleIds: [],
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
          scheduleIds: [],
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: "Este precio está en uso. Solo podés cambiar el nombre.",
    });
    await expect(
      deletePrice(general.id, { hasDependencies: async () => true }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Este precio está en uso. No se puede borrar.",
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
        scheduleIds: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Este precio está en uso. Solo podés cambiar el nombre.",
    });
    await expect(deletePrice(price.id)).resolves.toMatchObject({
      ok: false,
      error: "Este precio está en uso. No se puede borrar.",
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
        scheduleIds: [catalog.schedule.id],
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
        scheduleIds: [],
      }),
    ).resolves.toMatchObject(uncoveredUpdate);
    await expect(
      updatePrice(openEnded.id, {
        groupType: "solo",
        amount: 20000,
        paymentDeadline: null,
        scheduleIds: [catalog.schedule.id],
      }),
    ).resolves.toMatchObject(uncoveredUpdate);
    await expect(
      updatePrice(openEnded.id, {
        groupType: "duo",
        amount: 20000,
        paymentDeadline: null,
        scheduleIds: [],
      }),
    ).resolves.toMatchObject(uncoveredUpdate);

    // The amount is not a coverage question: the row stays open-ended and
    // general, so the edit goes through.
    await expect(
      updatePrice(openEnded.id, {
        groupType: "solo",
        amount: 21000,
        paymentDeadline: null,
        scheduleIds: [],
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
      scheduleIds: [catalog.schedule.id],
    });

    // The general tail goes out of band, so the guard's `scheduleIds` exit is
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
        scheduleIds: [],
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
        scheduleIds: [],
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
        scheduleIds: [],
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
        scheduleIds: [],
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
        scheduleIds: [],
      }),
    ).resolves.toMatchObject({
      ok: true,
      record: { amount: 12000 },
    });
    await expect(deletePrice(price.id)).resolves.toMatchObject({
      ok: true,
    });
  });

  test("reports on each listed price what the guards would refuse", async () => {
    const { academy, choreography, datedRung, event, openEnded } =
      await createCoveredPathFixture({
        academyName: "Academia Guardas",
        choreographyName: "Coreografía Guardas",
        email: "academia.guardas@example.com",
        eventName: "Regional 2032",
      });

    const readFlags = async (priceId: string) => {
      const listed = (await listPrices(event.id)).find(
        (price) => price.id === priceId,
      );

      return {
        isReferenced: listed?.isReferenced,
        keepsRegistrationOpen: listed?.keepsRegistrationOpen,
      };
    };

    await expect(readFlags(openEnded.id)).resolves.toEqual({
      isReferenced: false,
      keepsRegistrationOpen: true,
    });
    await expect(readFlags(datedRung.id)).resolves.toEqual({
      isReferenced: false,
      keepsRegistrationOpen: false,
    });

    await createSelectedPriceInscriptionForTest({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      selectedPriceId: datedRung.id,
    });

    await expect(readFlags(datedRung.id)).resolves.toEqual({
      isReferenced: true,
      keepsRegistrationOpen: false,
    });
  });
});

const frozenUpdateError =
  "Este precio está en uso. Solo podés cambiar el nombre.";
const frozenDeleteError = "Este precio está en uso. No se puede borrar.";
const uncoveredUpdateError =
  "Este precio es necesario mientras haya inscripciones activas. Solo podés cambiar el nombre y el monto.";
const uncoveredDeleteError =
  "Este precio es necesario mientras haya inscripciones activas. No se puede borrar.";

describe("a special price covering several schedules", () => {
  async function createThreeScheduleFixture() {
    const {
      event,
      modality,
      schedule: saturday,
    } = await createEventPriceFixture();
    const sunday = await createSavedSchedule(event.id, {
      modalityIds: [modality.id],
      name: "Domingo Mañana",
      scheduledDate: "2026-05-03",
    });
    const monday = await createSavedSchedule(event.id, {
      modalityIds: [modality.id],
      name: "Lunes Mañana",
      scheduledDate: "2026-05-04",
    });

    return { event, monday, saturday, sunday };
  }

  test("applies to every schedule it covers and lists them in schedule order", async () => {
    const { event, monday, saturday, sunday } =
      await createThreeScheduleFixture();
    await createSavedPrice(event.id);
    const shared = await createSavedPrice(event.id, {
      amount: 9000,
      name: "Precio compartido",
      scheduleIds: [sunday.id, saturday.id],
    });

    onBusinessDate("2026-05-20");
    for (const schedule of [saturday, sunday]) {
      await expect(
        resolveApplicableInscriptionPrice(db, {
          eventId: event.id,
          groupType: "solo",
          scheduleId: schedule.id,
        }),
      ).resolves.toMatchObject({ ok: true, price: { id: shared.id } });
    }
    await expect(
      resolveApplicableInscriptionPrice(db, {
        eventId: event.id,
        groupType: "solo",
        scheduleId: monday.id,
      }),
    ).resolves.toMatchObject({ ok: true, price: { name: "Precio base" } });

    const listed = await listPrices(event.id);

    expect(listed.find((price) => price.id === shared.id)).toMatchObject({
      isSpecialPrice: true,
      schedules: [{ name: "Sábado Mañana" }, { name: "Domingo Mañana" }],
    });
  });

  test("refuses to cover a schedule another special price of the same group type and deadline covers", async () => {
    const { event, monday, saturday, sunday } =
      await createThreeScheduleFixture();
    await createSavedPrice(event.id, {
      name: "Fin de semana",
      scheduleIds: [saturday.id, sunday.id],
    });

    await expect(
      createPrice(event.id, {
        groupType: "solo",
        amount: 9000,
        paymentDeadline: "2026-05-31",
        scheduleIds: [sunday.id, monday.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "Ya existe un precio especial para ese tipo de grupo y fecha límite en Domingo Mañana.",
      fieldErrors: { scheduleIds: "Revisá los cronogramas del precio." },
    });
    await expect(
      createPrice(event.id, {
        groupType: "solo",
        amount: 9000,
        paymentDeadline: "2026-06-30",
        scheduleIds: [sunday.id, monday.id],
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  test("rewrites the schedules it covers on update and frees the ones it drops", async () => {
    const { event, monday, saturday, sunday } =
      await createThreeScheduleFixture();
    const weekend = await createSavedPrice(event.id, {
      name: "Fin de semana",
      scheduleIds: [saturday.id, sunday.id],
    });

    await expect(
      updatePrice(weekend.id, {
        name: "Fin de semana",
        groupType: "solo",
        amount: 12000,
        paymentDeadline: "2026-05-31",
        scheduleIds: [sunday.id, monday.id],
      }),
    ).resolves.toMatchObject({ ok: true });

    const listed = await listPrices(event.id);

    expect(listed).toMatchObject([
      {
        id: weekend.id,
        schedules: [{ name: "Domingo Mañana" }, { name: "Lunes Mañana" }],
      },
    ]);
    await expect(deleteSchedule(saturday.id)).resolves.toMatchObject({
      ok: true,
    });
    await expect(deleteSchedule(monday.id)).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el cronograma porque tiene dependencias.",
    });
  });

  test("lets a price in use gain schedules and refuses dropping one its inscriptions sit on", async () => {
    const event = await createSavedEvent("Regional 2026", { activate: true });
    const { academy, catalog, choreography } =
      await createAcademyFinanceChoreographyFixture({
        academyName: "Academia Precio Compartido",
        choreographyName: "Coreografía Compartida",
        email: "academia.precio.compartido@example.com",
        event,
      });
    const night = await createSavedSchedule(event.id, {
      modalityIds: [catalog.modality.id],
      name: "Noche",
      startTime: "20:00",
    });
    const afternoon = await createSavedSchedule(event.id, {
      modalityIds: [catalog.modality.id],
      name: "Tarde",
      startTime: "15:00",
    });
    const special = await createSavedPrice(event.id, {
      amount: 15000,
      name: "Especial",
      paymentDeadline: null,
      scheduleIds: [catalog.schedule.id, afternoon.id],
    });
    await createSelectedPriceInscriptionForTest({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      selectedPriceId: special.id,
    });
    const input = {
      name: "Especial",
      groupType: "solo",
      amount: 15000,
      paymentDeadline: null,
    };

    // Adding a schedule, and dropping one no inscription of the price sits on,
    // leave every stored inscription where it was.
    await expect(
      updatePrice(special.id, {
        ...input,
        scheduleIds: [catalog.schedule.id, night.id],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      updatePrice(special.id, { ...input, scheduleIds: [night.id] }),
    ).resolves.toMatchObject({
      ok: false,
      error: `No se pueden quitar cronogramas con inscripciones que usan este precio: ${catalog.schedule.name}.`,
      fieldErrors: { scheduleIds: "Revisá los cronogramas del precio." },
    });
    await expect(
      updatePrice(special.id, {
        ...input,
        amount: 16000,
        scheduleIds: [catalog.schedule.id, night.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "Este precio está en uso. Solo podés cambiar el nombre y los cronogramas.",
    });
    await expect(listPrices(event.id)).resolves.toContainEqual(
      expect.objectContaining({
        id: special.id,
        scheduleIds: [catalog.schedule.id, night.id].sort(),
      }),
    );
  });

  test("turns into a general price when every schedule is dropped", async () => {
    const { event, saturday } = await createThreeScheduleFixture();
    const special = await createSavedPrice(event.id, {
      name: "Especial",
      scheduleIds: [saturday.id],
    });

    await expect(
      updatePrice(special.id, {
        name: "Especial",
        groupType: "solo",
        amount: 12000,
        paymentDeadline: "2026-05-31",
        scheduleIds: [],
      }),
    ).resolves.toMatchObject({ ok: true, record: { isSpecialPrice: false } });
    await expect(listPrices(event.id)).resolves.toMatchObject([
      { id: special.id, schedules: [], isSpecialPrice: false },
    ]);
  });
});

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

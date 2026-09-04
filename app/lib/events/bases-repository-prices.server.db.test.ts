import { describe, expect, test } from "vitest";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { prices } from "@/db/schema";
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

// `db.execute` hands back a bare array on postgres.js and a `{ rows }` envelope
// on PGlite, which is what the fast config runs. Same shape as the helper in
// `tests/db/schema-security.db.test.ts`.
function readRows<Row extends object>(result: { rows: Row[] } | Row[]) {
  return Array.isArray(result) ? result : result.rows;
}

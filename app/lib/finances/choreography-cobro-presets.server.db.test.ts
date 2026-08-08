import { asc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations, prices } from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
} from "@/features/portal/choreographies/test-support/db";
import { payChoreographiesPreset } from "@/lib/finances/choreography-cobro-presets.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  registerPaymentForTest,
} from "../admin/finances/finances.test-support";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

/**
 * Two `solo` choreographies of the same academy, one inscription each, at the
 * catalogue price of 10000 with a 30 % deposit. That is the shape a list action
 * operates on: several choreographies at once, funded from one pool.
 */
async function seedPresetFixture(paymentAmounts: number[]) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, catalog, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Preset",
      email: `preset.${crypto.randomUUID()}@example.com`,
      choreographyName: "Aire",
      event,
    });
  const second = await createChoreographyRecord({
    academyId: academy.academy.id,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Tango",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  const inscriptionIds: string[] = [];
  for (const [index, target] of [choreography, second].entries()) {
    const dancer = await createDancer(academy.academy.id, {
      firstName: `Bailarín ${index}`,
      lastName: "Preset",
    });
    const [inscription] = await db
      .insert(choreographyDancers)
      .values({
        ageAtEventStart: 14,
        choreographyId: target.id,
        dancerId: dancer.id,
      })
      .returning();

    if (!inscription) {
      throw new Error("Expected an inscription.");
    }

    inscriptionIds.push(inscription.id);
  }

  for (const [index, amount] of paymentAmounts.entries()) {
    await registerPaymentForTest({
      academyId: academy.academy.id,
      amount: String(amount),
      eventId: event.id,
      paymentDate: `2026-04-0${index + 1}`,
    });
  }

  const [price] = await db
    .select({ id: prices.id })
    .from(prices)
    .where(eq(prices.eventId, event.id))
    .orderBy(asc(prices.amount));

  return {
    academyId: academy.academy.id,
    choreographyIds: [choreography.id, second.id],
    eventId: event.id,
    inscriptionIds,
    priceId: price.id,
  };
}

async function readAllocations(inscriptionIds: string[]) {
  return await db
    .select({
      amount: paymentAllocations.amount,
      inscriptionId: paymentAllocations.inscriptionId,
    })
    .from(paymentAllocations)
    .where(inArray(paymentAllocations.inscriptionId, inscriptionIds));
}

function sumByInscription(
  rows: Array<{ amount: number; inscriptionId: string }>,
) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    totals.set(
      row.inscriptionId,
      (totals.get(row.inscriptionId) ?? 0) + row.amount,
    );
  }

  return totals;
}

describe("payChoreographiesPreset", () => {
  test("funds the owed deposit of every selected choreography with plain allocations", async () => {
    const fixture = await seedPresetFixture([10000]);

    const result = await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "deposit",
    });

    expect(result).toEqual({ ok: true });

    const totals = sumByInscription(
      await readAllocations(fixture.inscriptionIds),
    );

    expect(totals.get(fixture.inscriptionIds[0])).toBe(3000);
    expect(totals.get(fixture.inscriptionIds[1])).toBe(3000);

    // Indistinguible de una asignación tipeada a mano: la fila es sólo
    // `(pago, inscripción, monto)`, y el preset no congela ningún snapshot.
    const inscriptionRows = await db
      .select({
        depositReferenceDate: choreographyDancers.depositReferenceDate,
        selectedPriceId: choreographyDancers.selectedPriceId,
      })
      .from(choreographyDancers)
      .where(inArray(choreographyDancers.id, fixture.inscriptionIds));

    for (const row of inscriptionRows) {
      expect(row.selectedPriceId).toBe(fixture.priceId);
      expect(row.depositReferenceDate).toBeNull();
    }
  });

  test("settles the balance on top of a deposit already allocated", async () => {
    const fixture = await seedPresetFixture([20000]);

    await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "deposit",
    });

    const result = await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "balance",
    });

    expect(result).toEqual({ ok: true });

    const totals = sumByInscription(
      await readAllocations(fixture.inscriptionIds),
    );

    expect(totals.get(fixture.inscriptionIds[0])).toBe(10000);
    expect(totals.get(fixture.inscriptionIds[1])).toBe(10000);
  });

  test("rolls the whole preset back when the pool runs dry partway through", async () => {
    const fixture = await seedPresetFixture([4000]);

    const result = await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "deposit",
    });

    expect(result.ok).toBe(false);
    expect(await readAllocations(fixture.inscriptionIds)).toEqual([]);

    // El precio es la otra mitad de la transacción: si sobreviviera al
    // rechazo, la coreografía quedaría con un precio fijado por un preset que
    // no movió un peso.
    const inscriptionRows = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(inArray(choreographyDancers.id, fixture.inscriptionIds));

    for (const row of inscriptionRows) {
      expect(row.selectedPriceId).toBeNull();
    }
  });

  // Sin pick, el escritor no toca ningún precio: cada inscripción se financia
  // contra el precio que ya le resuelve, que es exactamente el que la lista le
  // mostró al administrador. Es el camino por defecto del diálogo.
  test("leaves every price alone when no row is picked", async () => {
    const fixture = await seedPresetFixture([20000]);
    const [cheaper] = await db
      .insert(prices)
      .values({
        amount: 4000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo barato",
        paymentDeadline: "2026-12-31",
        scheduleId: null,
      })
      .returning();

    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: fixture.priceId })
      .where(inArray(choreographyDancers.id, fixture.inscriptionIds));

    const result = await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: {},
      stage: "deposit",
    });

    expect(result).toEqual({ ok: true });

    const inscriptionRows = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(inArray(choreographyDancers.id, fixture.inscriptionIds));

    for (const row of inscriptionRows) {
      expect(row.selectedPriceId).toBe(fixture.priceId);
      expect(row.selectedPriceId).not.toBe(cheaper.id);
    }

    // 30 % de $10.000, no de los $4.000 de la fila más barata.
    const totals = sumByInscription(
      await readAllocations(fixture.inscriptionIds),
    );

    expect(totals.get(fixture.inscriptionIds[0])).toBe(3000);
    expect(totals.get(fixture.inscriptionIds[1])).toBe(3000);
  });

  test("refuses a price that does not belong to the choreography", async () => {
    const fixture = await seedPresetFixture([10000]);
    const [foreignPrice] = await db
      .insert(prices)
      .values({
        amount: 25000,
        eventId: fixture.eventId,
        groupType: "grupal",
        name: "Precio Grupal",
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      })
      .returning();

    const result = await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: foreignPrice.id },
      stage: "deposit",
    });

    expect(result.ok).toBe(false);
    expect(await readAllocations(fixture.inscriptionIds)).toEqual([]);
  });

  test("keeps the price of an inscription that already holds money", async () => {
    const fixture = await seedPresetFixture([20000]);
    const [cheaper] = await db
      .insert(prices)
      .values({
        amount: 8000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo temprano",
        paymentDeadline: "2026-02-28",
        scheduleId: null,
      })
      .returning();

    await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "deposit",
    });

    await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: cheaper.id },
      stage: "balance",
    });

    const inscriptionRows = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(inArray(choreographyDancers.id, fixture.inscriptionIds));

    for (const row of inscriptionRows) {
      expect(row.selectedPriceId).toBe(fixture.priceId);
    }
  });
});

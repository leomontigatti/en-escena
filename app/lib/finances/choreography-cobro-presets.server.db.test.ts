import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import { asc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { restrictedChoreographyInscriptionId } from "@/lib/finances/allocation-target.server";
import {
  choreographies,
  choreographyDancers,
  paymentAllocations,
  payments,
  prices,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
} from "@/features/portal/choreographies/test-support/db";
import { payChoreographiesPreset } from "@/lib/finances/choreography-cobro-presets.server";
import { allocateToInscription } from "@/lib/finances/inscription-allocation.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import {
  createAcademyFinanceChoreographyFixture,
  registerPaymentForTest,
} from "@/lib/admin/finances/finances.test-support";
import { createSavedEvent } from "@/lib/test-support/events";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../tests/db/harness";
import { runBehindAHolder } from "../../../tests/db/lock-contention";

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
      inscriptionId: restrictedChoreographyInscriptionId,
    })
    .from(paymentAllocations)
    .where(
      inArray(paymentAllocations.choreographyInscriptionId, inscriptionIds),
    );
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

    // Indistinguishable from a hand-typed allocation: the row is only
    // `(payment, inscription, amount)`, and the only thing the preset writes on
    // the inscription is the chosen price.
    const inscriptionRows = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(inArray(choreographyDancers.id, fixture.inscriptionIds));

    for (const row of inscriptionRows) {
      expect(row.selectedPriceId).toBe(fixture.priceId);
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

    // The price is the other half of the transaction: if it survived the
    // rejection, the choreography would be left with a price set by a preset that
    // did not move a peso.
    const inscriptionRows = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(inArray(choreographyDancers.id, fixture.inscriptionIds));

    for (const row of inscriptionRows) {
      expect(row.selectedPriceId).toBeNull();
    }
  });

  // With no pick, the writer touches no price: each inscription is financed
  // against the price that already resolves for it, which is exactly the one the
  // list showed the administrator. It is the dialog's default path.
  test("leaves every price alone when no row is picked", async () => {
    const fixture = await seedPresetFixture([20000]);
    const [cheaper] = await insertTestPrices([
      {
        amount: 4000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo barato",
        paymentDeadline: "2026-12-31",
      },
    ]);

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

    // 30% of $10,000, not of the $4,000 of the cheaper row.
    const totals = sumByInscription(
      await readAllocations(fixture.inscriptionIds),
    );

    expect(totals.get(fixture.inscriptionIds[0])).toBe(3000);
    expect(totals.get(fixture.inscriptionIds[1])).toBe(3000);
  });

  test("refuses a price that does not belong to the choreography", async () => {
    const fixture = await seedPresetFixture([10000]);
    const [foreignPrice] = await insertTestPrices([
      {
        amount: 25000,
        eventId: fixture.eventId,
        groupType: "grupal",
        name: "Precio Grupal",
        paymentDeadline: "2026-05-31",
      },
    ]);

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

  test("applies the picked price to an inscription still below its deposit", async () => {
    const fixture = await seedPresetFixture([20000]);
    const [cheaper] = await insertTestPrices([
      {
        amount: 8000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo temprano",
        paymentDeadline: "2026-02-28",
      },
    ]);

    // 1000 against the catalogue row's 3000 deposit: money on the inscription, and
    // nothing fixed by it. A preset may still say which row prices it.
    const [inscriptionId] = fixture.inscriptionIds;
    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: fixture.priceId })
      .where(eq(choreographyDancers.id, inscriptionId));
    const [payment] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.academyId, fixture.academyId));
    await db.insert(paymentAllocations).values({
      academyId: fixture.academyId,
      amount: 1000,
      eventId: fixture.eventId,
      choreographyInscriptionId: inscriptionId,
      paymentId: payment.id,
    });

    const result = await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: cheaper.id },
      stage: "deposit",
    });

    expect(result.ok).toBe(true);
    const [row] = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.id, inscriptionId));
    expect(row.selectedPriceId).toBe(cheaper.id);
  });

  test("neither re-prices nor funds a waived inscription", async () => {
    const fixture = await seedPresetFixture([20000]);
    const [cheaper] = await insertTestPrices([
      {
        amount: 8000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo temprano",
        paymentDeadline: "2026-02-28",
      },
    ]);
    const [inscriptionId] = fixture.inscriptionIds;
    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: fixture.priceId, waivedAt: new Date() })
      .where(eq(choreographyDancers.id, inscriptionId));

    const result = await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: cheaper.id },
      stage: "deposit",
    });

    expect(result.ok).toBe(true);
    const [row] = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.id, inscriptionId));
    expect(row.selectedPriceId).toBe(fixture.priceId);
    expect(await readAllocations([inscriptionId])).toEqual([]);
  });

  test("keeps the price of an inscription that already covers its deposit", async () => {
    const fixture = await seedPresetFixture([20000]);
    const [cheaper] = await insertTestPrices([
      {
        amount: 8000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo temprano",
        paymentDeadline: "2026-02-28",
      },
    ]);

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

describe("payChoreographiesPreset on a choreography whose group type moved", () => {
  // #660: a roster save below the deposit leaves the stored solo row behind;
  // funding without a pick for the new group type would freeze it there.
  test("refuses to fund an inscription storing a row of another group type when no price is picked for its own", async () => {
    const fixture = await seedPresetFixture([10000]);
    const [choreographyId] = fixture.choreographyIds;
    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: fixture.priceId })
      .where(eq(choreographyDancers.id, fixture.inscriptionIds[0]!));
    await db
      .update(choreographies)
      .set({ groupType: "duo" })
      .where(eq(choreographies.id, choreographyId!));

    const result = await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: [choreographyId!],
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "deposit",
    });

    expect(result).toMatchObject({ ok: false });
    await expect(
      readAllocations([fixture.inscriptionIds[0]!]),
    ).resolves.toEqual([]);
  });

  test("refuses the same allocation from the dialog when it names no price", async () => {
    const fixture = await seedPresetFixture([10000]);
    const [choreographyId] = fixture.choreographyIds;
    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: fixture.priceId })
      .where(eq(choreographyDancers.id, fixture.inscriptionIds[0]!));
    await db
      .update(choreographies)
      .set({ groupType: "duo" })
      .where(eq(choreographies.id, choreographyId!));

    const result = await allocateToInscription({
      academyId: fixture.academyId,
      amount: 3000,
      choreographyId: choreographyId!,
      eventId: fixture.eventId,
      inscriptionId: fixture.inscriptionIds[0]!,
      priceId: null,
    });

    expect(result).toMatchObject({ ok: false });
    await expect(
      readAllocations([fixture.inscriptionIds[0]!]),
    ).resolves.toEqual([]);
  });

  test("still funds the balance of an inscription already frozen on a row of another group type", async () => {
    const fixture = await seedPresetFixture([10000]);
    const [choreographyId] = fixture.choreographyIds;
    await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: [choreographyId!],
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "deposit",
    });
    await db
      .update(choreographies)
      .set({ groupType: "duo" })
      .where(eq(choreographies.id, choreographyId!));

    // A row frozen before #660 guarded the roster: the preset offers no picker
    // for it, and refusing would leave it with no way to be paid.
    const result = await payChoreographiesPreset({
      academyId: fixture.academyId,
      choreographyIds: [choreographyId!],
      eventId: fixture.eventId,
      priceIdByGroupType: {},
      stage: "balance",
    });

    expect(result).toEqual({ ok: true });
  });
});

describe.skipIf(isPgliteTestBackend())(
  "payChoreographiesPreset racing a draft save",
  () => {
    // #660: the draft save moves the group type under the choreography's row
    // lock, so a preset that read it unlocked would freeze the old one's price.
    test("prices the group type the draft save commits while the preset waits", async () => {
      const fixture = await seedPresetFixture([10000]);
      const [duoPrice] = await insertTestPrices([
        {
          amount: 15000,
          eventId: fixture.eventId,
          groupType: "duo",
          name: "Precio Dúo",
          paymentDeadline: null,
        },
      ]);
      const [choreographyId] = fixture.choreographyIds;

      const result = await runBehindAHolder({
        waitingOn: "inscription lock",
        // What the draft save holds while it moves the group type.
        hold: async (tx) => {
          await tx
            .select({ id: choreographyDancers.id })
            .from(choreographyDancers)
            .where(eq(choreographyDancers.choreographyId, choreographyId!))
            .for("update");
          await tx
            .update(choreographies)
            .set({ groupType: "duo" })
            .where(eq(choreographies.id, choreographyId!));
        },
        contender: () =>
          payChoreographiesPreset({
            academyId: fixture.academyId,
            choreographyIds: [choreographyId!],
            eventId: fixture.eventId,
            priceIdByGroupType: { duo: duoPrice!.id, solo: fixture.priceId },
            stage: "deposit",
          }),
      });

      expect(result).toEqual({ ok: true });
      const [inscription] = await db
        .select({ selectedPriceId: choreographyDancers.selectedPriceId })
        .from(choreographyDancers)
        .where(eq(choreographyDancers.id, fixture.inscriptionIds[0]!));
      expect(inscription?.selectedPriceId).toBe(duoPrice!.id);
    });
  },
);

import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import { asc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { restrictedChoreographyInscriptionId } from "@/lib/finances/allocation-target.server";
import {
  choreographies,
  choreographyDancers,
  dancers,
  paymentAllocations,
  payments,
  prices,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
} from "@/features/portal/choreographies/test-support/db";
import { createScheduleForModalityFixture } from "@/lib/choreographies/registration.test-support";
import { chargeThreshold } from "@/lib/finances/inscription-money.server";
import { allocateToInscription } from "@/lib/finances/inscription-money.server";
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
async function seedPresetFixture(
  paymentAmounts: number[],
  requiredDepositPercentage = 30,
) {
  const event = await createSavedEvent({ requiredDepositPercentage });
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
    catalog,
    choreographyIds: [choreography.id, second.id],
    eventId: event.id,
    inscriptionIds,
    priceId: price.id,
  };
}

/**
 * Puts the first dancer on the second choreography and on a third one, which
 * takes them to the three inscriptions that earn a `Descuento por bailarín`.
 */
async function addThirdInscriptionOfFirstDancer(
  fixture: Awaited<ReturnType<typeof seedPresetFixture>>,
) {
  const third = await createChoreographyRecord({
    academyId: fixture.academyId,
    categoryId: fixture.catalog.categoryWithLevel.id,
    eventId: fixture.eventId,
    experienceLevelId: fixture.catalog.level.id,
    modalityId: fixture.catalog.modality.id,
    name: "Milonga",
    scheduleCapacityId: fixture.catalog.scheduleCapacity.id,
    submodalityId: fixture.catalog.submodality.id,
  });
  const [first] = await db
    .select({ dancerId: choreographyDancers.dancerId })
    .from(choreographyDancers)
    .where(eq(choreographyDancers.id, fixture.inscriptionIds[0]));
  const rest = await db
    .insert(choreographyDancers)
    .values(
      [fixture.choreographyIds[1], third.id].map((choreographyId) => ({
        ageAtEventStart: 14,
        choreographyId,
        dancerId: first.dancerId,
      })),
    )
    .returning({ id: choreographyDancers.id });

  return {
    choreographyIds: [...fixture.choreographyIds, third.id],
    inscriptionIds: [fixture.inscriptionIds[0], ...rest.map((row) => row.id)],
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

describe("chargeThreshold on choreographies with a picked price that is not today's", () => {
  test.each([
    { allocated: 8000, amount: 8000, stage: "balance" },
    { allocated: 2400, amount: 8000, stage: "deposit" },
    { allocated: 12000, amount: 12000, stage: "balance" },
    { allocated: 3600, amount: 12000, stage: "deposit" },
  ] as const)(
    "charges the $stage of the $amount row the pick stored",
    async ({ allocated, amount, stage }) => {
      const fixture = await seedPresetFixture([20000]);
      const [picked] = await insertTestPrices([
        {
          amount,
          eventId: fixture.eventId,
          groupType: "solo",
          name: "Precio Solo vencido",
          paymentDeadline: "2026-02-28",
        },
      ]);
      const [inscriptionId] = fixture.inscriptionIds;

      const result = await chargeThreshold({
        kind: "choreography",
        academyId: fixture.academyId,
        choreographyIds: [fixture.choreographyIds[0]],
        eventId: fixture.eventId,
        priceIdByGroupType: { solo: picked.id },
        stage,
      });

      expect(result).toEqual({ ok: true });
      expect(
        sumByInscription(await readAllocations([inscriptionId])).get(
          inscriptionId,
        ),
      ).toBe(allocated);
    },
  );

  test("charges a picked row whose deposit rounds to nothing", async () => {
    const fixture = await seedPresetFixture([20000], 10);
    const [picked] = await insertTestPrices([
      {
        amount: 4,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo vencido",
        paymentDeadline: "2026-02-28",
      },
    ]);
    const [inscriptionId] = fixture.inscriptionIds;

    const result = await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds: [fixture.choreographyIds[0]],
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: picked.id },
      stage: "balance",
    });

    expect(result).toEqual({ ok: true });
    expect(
      sumByInscription(await readAllocations([inscriptionId])).get(
        inscriptionId,
      ),
    ).toBe(4);
  });

  test("takes the live dancer discount off the total of the picked row", async () => {
    const fixture = await seedPresetFixture([40000]);
    const [picked] = await insertTestPrices([
      {
        amount: 8000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo vencido",
        paymentDeadline: "2026-02-28",
      },
    ]);
    const { choreographyIds, inscriptionIds } =
      await addThirdInscriptionOfFirstDancer(fixture);

    const result = await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: picked.id },
      stage: "balance",
    });

    expect(result).toEqual({ ok: true });
    // Three inscriptions of one dancer: 10 % off all but the dearest of them.
    const allocated = await readAllocations(inscriptionIds);
    expect(allocated.reduce((sum, row) => sum + row.amount, 0)).toBe(22400);
  });

  test("charges today's row picked at a deposit above its discounted total", async () => {
    const fixture = await seedPresetFixture([40000], 100);
    const { choreographyIds, inscriptionIds } =
      await addThirdInscriptionOfFirstDancer(fixture);

    const result = await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "balance",
    });

    expect(result).toEqual({ ok: true });
    // 10000 and twice 10000 less the 10 % of the third inscription of a dancer.
    const allocated = await readAllocations(inscriptionIds);
    expect(allocated.reduce((sum, row) => sum + row.amount, 0)).toBe(28000);
  });

  test("refuses a pick below the money already on the inscription and moves nothing", async () => {
    const fixture = await seedPresetFixture([20000]);
    const [picked] = await insertTestPrices([
      {
        amount: 5000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo vencido",
        paymentDeadline: "2026-02-28",
      },
    ]);
    const [inscriptionId] = fixture.inscriptionIds;
    const [payment] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.academyId, fixture.academyId));
    await db.insert(paymentAllocations).values({
      academyId: fixture.academyId,
      amount: 6000,
      eventId: fixture.eventId,
      choreographyInscriptionId: inscriptionId,
      paymentId: payment.id,
    });

    const result = await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds: [fixture.choreographyIds[0]],
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: picked.id },
      stage: "balance",
    });

    expect(result).toEqual({
      ok: false,
      message:
        "Bailarín 0 Preset tiene asignados $ 1.000 más que el precio que le corresponde. Quitale la diferencia desde su detalle antes de asignar.",
    });
    const [row] = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.id, inscriptionId));
    expect(row.selectedPriceId).toBeNull();
    expect(
      sumByInscription(await readAllocations([inscriptionId])).get(
        inscriptionId,
      ),
    ).toBe(6000);
  });
});

describe("chargeThreshold on choreographies with a stored price and no pick", () => {
  test.each([
    { allocated: 8000, amount: 8000, onRow: 0, stage: "balance" },
    { allocated: 2400, amount: 8000, onRow: 0, stage: "deposit" },
    { allocated: 8000, amount: 8000, onRow: 1000, stage: "balance" },
    { allocated: 2400, amount: 8000, onRow: 1000, stage: "deposit" },
    { allocated: 12000, amount: 12000, onRow: 0, stage: "balance" },
    { allocated: 3600, amount: 12000, onRow: 0, stage: "deposit" },
  ] as const)(
    "charges the $stage of the stored $amount row with $onRow on it",
    async ({ allocated, amount, onRow, stage }) => {
      const fixture = await seedPresetFixture([20000]);
      const [stored] = await insertTestPrices([
        {
          amount,
          eventId: fixture.eventId,
          groupType: "solo",
          name: "Precio Solo vencido",
          paymentDeadline: "2026-02-28",
        },
      ]);
      const [inscriptionId] = fixture.inscriptionIds;

      await db
        .update(choreographyDancers)
        .set({ selectedPriceId: stored.id })
        .where(eq(choreographyDancers.id, inscriptionId));

      if (onRow > 0) {
        await allocateToInscription({
          academyId: fixture.academyId,
          amount: onRow,
          eventId: fixture.eventId,
          now: new Date(),
          priceId: stored.id,
          target: { id: inscriptionId, kind: "choreography" },
        });
      }

      const result = await chargeThreshold({
        kind: "choreography",
        academyId: fixture.academyId,
        choreographyIds: [fixture.choreographyIds[0]],
        eventId: fixture.eventId,
        priceIdByGroupType: {},
        stage,
      });

      expect(result).toEqual({ ok: true });
      expect(
        sumByInscription(await readAllocations([inscriptionId])).get(
          inscriptionId,
        ),
      ).toBe(allocated);

      const [row] = await db
        .select({ selectedPriceId: choreographyDancers.selectedPriceId })
        .from(choreographyDancers)
        .where(eq(choreographyDancers.id, inscriptionId));

      expect(row.selectedPriceId).toBe(stored.id);
    },
  );

  test("refuses one storing a row that does not price its schedule", async () => {
    const fixture = await seedPresetFixture([20000]);
    const otherSchedule = await createScheduleForModalityFixture({
      eventId: fixture.eventId,
      modalityId: fixture.catalog.modality.id,
    });
    const [stored] = await insertTestPrices([
      {
        amount: 8000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio especial de otro cronograma",
        paymentDeadline: "2026-02-28",
        scheduleIds: [otherSchedule.id],
      },
    ]);
    const [inscriptionId] = fixture.inscriptionIds;

    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: stored.id })
      .where(eq(choreographyDancers.id, inscriptionId));

    const result = await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds: [fixture.choreographyIds[0]],
      eventId: fixture.eventId,
      priceIdByGroupType: {},
      stage: "deposit",
    });

    expect(result).toEqual({
      ok: false,
      message:
        "Elegí un precio: hay inscripciones que guardan el precio de otro cronograma.",
    });
    await expect(readAllocations([inscriptionId])).resolves.toEqual([]);
  });

  test("charges today's row beside it on an inscription storing none", async () => {
    const fixture = await seedPresetFixture([20000]);
    const [stored] = await insertTestPrices([
      {
        amount: 8000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo vencido",
        paymentDeadline: "2026-02-28",
      },
    ]);
    const [storing, storingNone] = fixture.inscriptionIds;

    await db
      .update(choreographyDancers)
      .set({ selectedPriceId: stored.id })
      .where(eq(choreographyDancers.id, storing));

    const result = await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: {},
      stage: "balance",
    });

    expect(result).toEqual({ ok: true });

    const totals = sumByInscription(
      await readAllocations(fixture.inscriptionIds),
    );

    expect(totals.get(storing)).toBe(8000);
    expect(totals.get(storingNone)).toBe(10000);
  });
});

describe("chargeThreshold on choreographies with a pick whose deposit cannot fit", () => {
  const refusalOf = (price: string) =>
    `No se puede aplicar el precio de ${price} a Bailarín 0 Preset: la seña de ese precio supera lo que la inscripción adeuda.`;

  async function expectNothingMoved(inscriptionIds: string[]) {
    await expect(readAllocations(inscriptionIds)).resolves.toEqual([]);
    const rows = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(inArray(choreographyDancers.id, inscriptionIds));
    expect(rows.map((row) => row.selectedPriceId)).toEqual(
      inscriptionIds.map(() => null),
    );
  }

  test.each(["deposit", "balance"] as const)(
    "refuses a %s pick whose deposit is above what the row owes today",
    async (stage) => {
      const fixture = await seedPresetFixture([20000]);
      const [picked] = await insertTestPrices([
        {
          amount: 40000,
          eventId: fixture.eventId,
          groupType: "solo",
          name: "Precio Solo vencido",
          paymentDeadline: "2026-02-28",
        },
      ]);

      const result = await chargeThreshold({
        kind: "choreography",
        academyId: fixture.academyId,
        choreographyIds: [fixture.choreographyIds[0]],
        eventId: fixture.eventId,
        priceIdByGroupType: { solo: picked.id },
        stage,
      });

      expect(result).toEqual({ ok: false, message: refusalOf("$ 40.000") });
      await expectNothingMoved([fixture.inscriptionIds[0]]);
    },
  );

  test.each(["deposit", "balance"] as const)(
    "refuses a %s pick whose deposit is above its own discounted total",
    async (stage) => {
      const fixture = await seedPresetFixture([40000], 95);
      const [picked] = await insertTestPrices([
        {
          amount: 9000,
          eventId: fixture.eventId,
          groupType: "solo",
          name: "Precio Solo vencido",
          paymentDeadline: "2026-02-28",
        },
      ]);
      const { choreographyIds, inscriptionIds } =
        await addThirdInscriptionOfFirstDancer(fixture);

      const result = await chargeThreshold({
        kind: "choreography",
        academyId: fixture.academyId,
        choreographyIds,
        eventId: fixture.eventId,
        priceIdByGroupType: { solo: picked.id },
        stage,
      });

      expect(result).toEqual({ ok: false, message: refusalOf("$ 9.000") });
      await expectNothingMoved(inscriptionIds);
    },
  );

  test.each(["deposit", "balance"] as const)(
    "refuses a %s with no pick on a stored row whose deposit is above its own discounted total",
    async (stage) => {
      const fixture = await seedPresetFixture([40000], 95);
      const [stored] = await insertTestPrices([
        {
          amount: 9000,
          eventId: fixture.eventId,
          groupType: "solo",
          name: "Precio Solo vencido",
          paymentDeadline: "2026-02-28",
        },
      ]);
      const { choreographyIds, inscriptionIds } =
        await addThirdInscriptionOfFirstDancer(fixture);

      await db
        .update(choreographyDancers)
        .set({ selectedPriceId: stored.id })
        .where(inArray(choreographyDancers.id, inscriptionIds));

      const result = await chargeThreshold({
        kind: "choreography",
        academyId: fixture.academyId,
        choreographyIds,
        eventId: fixture.eventId,
        priceIdByGroupType: {},
        stage,
      });

      expect(result).toEqual({ ok: false, message: refusalOf("$ 9.000") });
      await expect(readAllocations(inscriptionIds)).resolves.toEqual([]);
    },
  );

  test("refuses a deposit charge on today's row picked at a deposit above its discounted total", async () => {
    const fixture = await seedPresetFixture([40000], 100);
    const { choreographyIds, inscriptionIds } =
      await addThirdInscriptionOfFirstDancer(fixture);

    const result = await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "deposit",
    });

    expect(result).toEqual({ ok: false, message: refusalOf("$ 10.000") });
    await expectNothingMoved(inscriptionIds);
  });

  test("refuses a pick whose deposit fits today's price but not today's discounted total", async () => {
    const fixture = await seedPresetFixture([40000], 80);
    const [picked] = await insertTestPrices([
      {
        amount: 12000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo vencido",
        paymentDeadline: "2026-02-28",
      },
    ]);
    const { choreographyIds, inscriptionIds } =
      await addThirdInscriptionOfFirstDancer(fixture);

    const result = await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: picked.id },
      stage: "deposit",
    });

    expect(result).toEqual({ ok: false, message: refusalOf("$ 12.000") });
    await expectNothingMoved(inscriptionIds);
  });

  test("rolls back the inscription the run already funded", async () => {
    const fixture = await seedPresetFixture([20000]);
    // The funded inscription is the one that sorts first: the run walks them
    // in id order, so it reaches the refused one with money already moved.
    const [funded, refused] = [
      {
        choreographyId: fixture.choreographyIds[0],
        id: fixture.inscriptionIds[0],
      },
      {
        choreographyId: fixture.choreographyIds[1],
        id: fixture.inscriptionIds[1],
      },
    ].sort((a, b) => a.id.localeCompare(b.id));
    await db
      .update(choreographies)
      .set({ groupType: "duo" })
      .where(eq(choreographies.id, funded.choreographyId));
    const [fittingPick, unfittingPick] = await insertTestPrices([
      {
        amount: 8000,
        eventId: fixture.eventId,
        groupType: "duo",
        name: "Precio Dúo",
      },
      {
        amount: 40000,
        eventId: fixture.eventId,
        groupType: "solo",
        name: "Precio Solo vencido",
        paymentDeadline: "2026-02-28",
      },
    ]);
    const [dancer] = await db
      .select({ firstName: dancers.firstName })
      .from(choreographyDancers)
      .innerJoin(dancers, eq(dancers.id, choreographyDancers.dancerId))
      .where(eq(choreographyDancers.id, refused.id));

    const result = await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { duo: fittingPick.id, solo: unfittingPick.id },
      stage: "deposit",
    });

    expect(result).toEqual({
      ok: false,
      message: refusalOf("$ 40.000").replace("Bailarín 0", dancer.firstName),
    });
    await expectNothingMoved(fixture.inscriptionIds);
  });
});

describe("chargeThreshold on choreographies", () => {
  test("funds the owed deposit of every selected choreography with plain allocations", async () => {
    const fixture = await seedPresetFixture([10000]);

    const result = await chargeThreshold({
      kind: "choreography",
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

    await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "deposit",
    });

    const result = await chargeThreshold({
      kind: "choreography",
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

    const result = await chargeThreshold({
      kind: "choreography",
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

  test("takes a peso at the deposit stage of a row whose deposit rounds to nothing", async () => {
    const fixture = await seedPresetFixture([20000], 10);
    await db
      .update(prices)
      .set({ amount: 4 })
      .where(eq(prices.id, fixture.priceId));
    const [inscriptionId] = fixture.inscriptionIds;

    const result = await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds: [fixture.choreographyIds[0]],
      eventId: fixture.eventId,
      priceIdByGroupType: {},
      stage: "deposit",
    });

    expect(result).toEqual({ ok: true });
    expect(
      sumByInscription(await readAllocations([inscriptionId])).get(
        inscriptionId,
      ),
    ).toBe(1);
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

    const result = await chargeThreshold({
      kind: "choreography",
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

    const result = await chargeThreshold({
      kind: "choreography",
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

    const result = await chargeThreshold({
      kind: "choreography",
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

    await chargeThreshold({
      kind: "choreography",
      academyId: fixture.academyId,
      choreographyIds: fixture.choreographyIds,
      eventId: fixture.eventId,
      priceIdByGroupType: { solo: fixture.priceId },
      stage: "deposit",
    });

    await chargeThreshold({
      kind: "choreography",
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

describe("chargeThreshold on choreographies on a choreography whose group type moved", () => {
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

    const result = await chargeThreshold({
      kind: "choreography",
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

  // The band the dialog reads as locked: past the new group type's deposit,
  // below the stored row's. The dialog posts no price there.
  test("stores the row in effect when the dialog names no price over a stored row of another group type", async () => {
    const fixture = await seedPresetFixture([10000]);
    const [choreographyId] = fixture.choreographyIds;
    const inscriptionId = fixture.inscriptionIds[0]!;
    const allocate = (amount: number, priceId: string | null) =>
      allocateToInscription({
        now: new Date(),
        academyId: fixture.academyId,
        amount,
        eventId: fixture.eventId,
        target: { id: inscriptionId, kind: "choreography" },
        priceId,
      });
    // 2000 against the solo row's 3000 deposit.
    await allocate(2000, fixture.priceId);
    await db
      .update(choreographies)
      .set({ groupType: "duo" })
      .where(eq(choreographies.id, choreographyId!));

    const withoutDuoPrice = await allocate(500, null);
    // A deposit of 1500, already covered by the 2000 held.
    const [duoPrice] = await insertTestPrices([
      {
        amount: 5000,
        eventId: fixture.eventId,
        groupType: "duo",
        name: "Precio Dúo",
        paymentDeadline: null,
      },
    ]);
    const withDuoPrice = await allocate(500, null);

    expect(withoutDuoPrice).toMatchObject({ ok: false });
    expect(withDuoPrice).toEqual({ ok: true });
    const [inscription] = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.id, inscriptionId));
    expect(inscription?.selectedPriceId).toBe(duoPrice!.id);
  });

  test("still funds the balance of an inscription already frozen on a row of another group type", async () => {
    const fixture = await seedPresetFixture([10000]);
    const [choreographyId] = fixture.choreographyIds;
    await chargeThreshold({
      kind: "choreography",
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
    const result = await chargeThreshold({
      kind: "choreography",
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
  "chargeThreshold on choreographies racing a draft save",
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
          chargeThreshold({
            kind: "choreography",
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

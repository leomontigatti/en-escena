import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  payments,
  prices,
  seminarInscriptions,
  seminarPrices,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import { seedEventSeminarFinanceFixture } from "@/lib/admin/finances/seminar-finances.test-support";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import {
  readAcademyAvailableBalance,
  readInscriptionAllocatedAmount,
  readTargetThresholds,
} from "@/lib/finances/allocation-pool.server";
import type { AllocationTarget } from "@/lib/finances/allocation-target.server";
import { deriveInscriptionFinancialFigures } from "@/lib/finances/inscription-financial-status";
import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import {
  allocateToInscription,
  chargeThreshold,
  releaseInscriptionExcess,
  releaseRetainedInscriptionDeposit,
  removeFromInscription,
} from "@/lib/finances/inscription-money.server";
import { inscriptionMoneyRefusals } from "@/lib/finances/inscription-money-refusals";
import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

type SeededInscription = {
  academyId: string;
  /** A second active inscription of the academy, and the selection reaching
   * both of them. */
  addSibling: () => Promise<{ parentIds: string[]; target: AllocationTarget }>;
  eventId: string;
  /** A row of the list this inscription is not priced by. */
  foreignPriceId: string;
  /** Leaves the pool holding exactly this much. */
  fundPool: (amount: number) => Promise<void>;
  /** A dearer row of the inscription's own list. */
  otherPriceId: string;
  /** The choreography or the seminar the inscription hangs from. */
  parentId: string;
  /** The row the seed offers the inscription. */
  priceId: string;
  /** Reads the row the inscription stores. */
  readSelectedPriceId: () => Promise<string | null>;
  /** Stores a row directly, as a row left behind by a change of key would be. */
  storePrice: (priceId: string) => Promise<void>;
  /** Drops the row's price under the money on it: a passive excess. */
  reprice: (amount: number) => Promise<void>;
  target: AllocationTarget;
  /** Stamps the row withdrawn, keeping whatever it holds. */
  withdraw: () => Promise<void>;
};

/** The two kinds as the contract sees them: same gestures, different figures
 * and each kind's own not-found copy. */
const kinds = [
  {
    charge: chargeChoreographies,
    depositAmount: 3000,
    emptySelection: "Elegí al menos una coreografía.",
    kind: "choreography",
    noActiveInscriptions:
      "Las coreografías elegidas no tienen inscripciones activas.",
    refusedForEvent: choreographyNotFoundMessage,
    refusedForAcademy: choreographyNotFoundMessage,
    seed: seedChoreographyInscription,
    totalAmount: 10000,
  },
  {
    charge: chargeSeminars,
    depositAmount: 10000,
    emptySelection: "Elegí al menos un seminario.",
    kind: "seminar",
    noActiveInscriptions:
      "Los seminarios elegidos no tienen inscripciones activas.",
    refusedForEvent: "No encontramos ese seminario.",
    refusedForAcademy: inscriptionMoneyRefusals.inscriptionNotFound,
    seed: seedSeminarInscription,
    totalAmount: 20000,
  },
] as const;

/** A `solo` row of 10000 at the event's 30 %, and 50000 in the pool. */
async function seedChoreographyInscription(): Promise<SeededInscription> {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Contrato",
      choreographyName: "Contrato",
      email: `contrato.${crypto.randomUUID()}@example.com`,
      event,
    });
  const academyId = academy.academy.id;
  const dancer = await createDancer(academyId, {
    firstName: "Ana",
    lastName: "Alonso",
  });
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();
  const [price] = await db
    .select({ id: prices.id })
    .from(prices)
    .where(eq(prices.eventId, event.id));
  const [otherPrice, foreignPrice] = await insertTestPrices([
    {
      amount: 15000,
      eventId: event.id,
      groupType: "solo",
      name: "Solo tardío",
      paymentDeadline: "2026-12-31",
    },
    {
      amount: 20000,
      eventId: event.id,
      groupType: "duo",
      name: "Dúo",
      paymentDeadline: "2026-12-31",
    },
  ]);
  const target = { id: inscription!.id, kind: "choreography" as const };

  await db.insert(payments).values({
    academyId,
    amount: 50000,
    eventId: event.id,
    paymentDate: "2026-04-01",
    paymentMethod: "transferencia",
    paymentNumber: 1,
  });

  return {
    academyId,
    addSibling: async () => {
      const sibling = await createDancer(academyId, {
        firstName: "Bea",
        lastName: "Blanco",
      });
      const [row] = await db
        .insert(choreographyDancers)
        .values({
          ageAtEventStart: 14,
          choreographyId: choreography.id,
          dancerId: sibling.id,
        })
        .returning();

      return {
        parentIds: [choreography.id],
        target: { id: row!.id, kind: "choreography" },
      };
    },
    eventId: event.id,
    foreignPriceId: foreignPrice!.id,
    fundPool: (amount) => setPool(academyId, event.id, amount),
    otherPriceId: otherPrice!.id,
    parentId: choreography.id,
    priceId: price!.id,
    readSelectedPriceId: async () => {
      const [row] = await db
        .select({ selectedPriceId: choreographyDancers.selectedPriceId })
        .from(choreographyDancers)
        .where(eq(choreographyDancers.id, inscription!.id));

      return row?.selectedPriceId ?? null;
    },
    reprice: async (amount) => {
      await db.update(prices).set({ amount }).where(eq(prices.id, price!.id));
    },
    storePrice: async (priceId) => {
      await db
        .update(choreographyDancers)
        .set({ selectedPriceId: priceId })
        .where(eq(choreographyDancers.id, inscription!.id));
    },
    target,
    withdraw: async () => {
      await db
        .update(choreographyDancers)
        .set({ withdrawnAt: new Date() })
        .where(eq(choreographyDancers.id, inscription!.id));
    },
  };
}

/** A row of 20000 at the seminar's 50 %, and 50000 in the pool. */
async function seedSeminarInscription(): Promise<SeededInscription> {
  const fixture = await seedEventSeminarFinanceFixture();
  const inscriptionId = fixture.anaInscriptionId;
  const [otherPrice, foreignPrice] = await db
    .insert(seminarPrices)
    .values([
      {
        amount: 30000,
        eventId: fixture.eventId,
        forParticipants: false,
        kind: "regular" as const,
        name: "No participante tardío",
        paymentDeadline: "2020-01-01",
      },
      {
        amount: 15000,
        eventId: fixture.eventId,
        forParticipants: true,
        kind: "regular" as const,
        name: "Participante general",
        paymentDeadline: null,
      },
    ])
    .returning();

  return {
    academyId: fixture.northAcademyId,
    addSibling: async () => ({
      parentIds: [fixture.abrilSeminarId, fixture.brunoSeminarId],
      target: { id: fixture.nicolasInscriptionId, kind: "seminar" },
    }),
    eventId: fixture.eventId,
    foreignPriceId: foreignPrice!.id,
    fundPool: (amount) =>
      setPool(fixture.northAcademyId, fixture.eventId, amount),
    otherPriceId: otherPrice!.id,
    parentId: fixture.abrilSeminarId,
    priceId: fixture.priceId,
    readSelectedPriceId: async () => {
      const [row] = await db
        .select({ selectedPriceId: seminarInscriptions.selectedPriceId })
        .from(seminarInscriptions)
        .where(eq(seminarInscriptions.id, inscriptionId));

      return row?.selectedPriceId ?? null;
    },
    reprice: async (amount) => {
      await db
        .update(seminarPrices)
        .set({ amount })
        .where(eq(seminarPrices.id, fixture.priceId));
    },
    storePrice: async (priceId) => {
      await db
        .update(seminarInscriptions)
        .set({ selectedPriceId: priceId })
        .where(eq(seminarInscriptions.id, inscriptionId));
    },
    target: { id: inscriptionId, kind: "seminar" },
    withdraw: async () => {
      await db
        .update(seminarInscriptions)
        .set({ withdrawnAt: new Date() })
        .where(eq(seminarInscriptions.id, inscriptionId));
    },
  };
}

async function setPool(academyId: string, eventId: string, amount: number) {
  await db
    .update(payments)
    .set({ amount })
    .where(
      and(eq(payments.academyId, academyId), eq(payments.eventId, eventId)),
    );
}

function chargeChoreographies(
  seeded: SeededInscription,
  input: { parentIds: string[]; stage: CobroStage },
) {
  return chargeThreshold({
    academyId: seeded.academyId,
    choreographyIds: input.parentIds,
    eventId: seeded.eventId,
    kind: "choreography",
    priceIdByGroupType: { solo: seeded.priceId },
    stage: input.stage,
  });
}

function chargeSeminars(
  seeded: SeededInscription,
  input: { parentIds: string[]; stage: CobroStage },
) {
  return chargeThreshold({
    academyId: seeded.academyId,
    eventId: seeded.eventId,
    kind: "seminar",
    now: new Date(),
    seminarIds: input.parentIds,
    stage: input.stage,
  });
}

function scopeOf(seeded: SeededInscription) {
  return {
    academyId: seeded.academyId,
    eventId: seeded.eventId,
    target: seeded.target,
  };
}

function allocate(
  seeded: SeededInscription,
  input: { amount: number; priceId: string | null },
) {
  return allocateToInscription({
    ...scopeOf(seeded),
    ...input,
    now: new Date(),
  });
}

/** Puts money on the row at the seed's price. */
async function fund(seeded: SeededInscription, amount: number) {
  expect(await allocate(seeded, { amount, priceId: seeded.priceId })).toEqual({
    ok: true,
  });
}

function readAllocated(seeded: SeededInscription) {
  return readInscriptionAllocatedAmount(db, seeded.target);
}

function readPool(seeded: SeededInscription) {
  return readAcademyAvailableBalance(db, seeded);
}

async function readFigures(seeded: SeededInscription) {
  return deriveInscriptionFinancialFigures({
    allocatedAmount: await readAllocated(seeded),
    thresholds: (await readTargetThresholds(db, scopeOf(seeded)))!,
  });
}

/** The four gestures, for the refusals that hold for every one of them. */
const gestures = [
  {
    name: "Asignar dinero",
    run: (scope: ReturnType<typeof scopeOf>) =>
      allocateToInscription({
        ...scope,
        amount: 1000,
        now: new Date(),
        priceId: null,
      }),
  },
  {
    name: "Quitar dinero",
    run: (scope: ReturnType<typeof scopeOf>) =>
      removeFromInscription({ ...scope, amount: 1000 }),
  },
  { name: "the excess release", run: releaseInscriptionExcess },
  { name: "the retained release", run: releaseRetainedInscriptionDeposit },
];

describe.each(kinds)("a threshold charge on $kind inscriptions", (kind) => {
  test("charges exactly the deposit, then the rest of the total", async () => {
    const seeded = await kind.seed();
    const selection = { parentIds: [seeded.parentId] };

    expect(
      await kind.charge(seeded, { ...selection, stage: "deposit" }),
    ).toEqual({ ok: true });
    expect(await seeded.readSelectedPriceId()).toBe(seeded.priceId);
    expect(await readAllocated(seeded)).toBe(kind.depositAmount);

    expect(
      await kind.charge(seeded, { ...selection, stage: "balance" }),
    ).toEqual({ ok: true });
    expect(await readAllocated(seeded)).toBe(kind.totalAmount);
  });

  test("refuses an empty selection", async () => {
    const seeded = await kind.seed();

    expect(
      await kind.charge(seeded, { parentIds: [], stage: "deposit" }),
    ).toEqual({ ok: false, message: kind.emptySelection });
  });

  test("refuses a selection with no active inscription", async () => {
    const seeded = await kind.seed();
    await seeded.withdraw();

    expect(
      await kind.charge(seeded, {
        parentIds: [seeded.parentId],
        stage: "deposit",
      }),
    ).toEqual({ ok: false, message: kind.noActiveInscriptions });
  });

  test("skips an inscription that already covered the stage", async () => {
    const seeded = await kind.seed();
    await fund(seeded, kind.depositAmount);
    const poolBefore = await readPool(seeded);

    expect(
      await kind.charge(seeded, {
        parentIds: [seeded.parentId],
        stage: "deposit",
      }),
    ).toEqual({ ok: true });
    expect(await readAllocated(seeded)).toBe(kind.depositAmount);
    expect(await readPool(seeded)).toBe(poolBefore);
  });

  test("rolls the whole charge back when the pool runs dry partway", async () => {
    const seeded = await kind.seed();
    const sibling = await seeded.addSibling();
    await seeded.fundPool(kind.depositAmount + 1);

    const result = await kind.charge(seeded, {
      parentIds: sibling.parentIds,
      stage: "deposit",
    });

    expect(result.ok).toBe(false);
    expect(await readAllocated(seeded)).toBe(0);
    expect(await readInscriptionAllocatedAmount(db, sibling.target)).toBe(0);
    expect(await seeded.readSelectedPriceId()).toBeNull();
    expect(await readPool(seeded)).toBe(kind.depositAmount + 1);
  });
});

describe("a threshold charge on choreography inscriptions", () => {
  test("refuses a picked row foreign to the selection in the dialog's words", async () => {
    const seeded = await seedChoreographyInscription();

    expect(
      await chargeThreshold({
        academyId: seeded.academyId,
        choreographyIds: [seeded.parentId],
        eventId: seeded.eventId,
        kind: "choreography",
        priceIdByGroupType: { solo: seeded.foreignPriceId },
        stage: "deposit",
      }),
    ).toEqual({
      ok: false,
      message: inscriptionMoneyRefusals.unknownPriceRow,
    });
  });
});

describe.each(kinds)("the money gestures on a $kind inscription", (kind) => {
  test("Asignar dinero stores the picked row and funds the inscription out of the pool", async () => {
    const seeded = await kind.seed();
    const poolBefore = await readPool(seeded);

    const result = await allocate(seeded, {
      amount: 1000,
      priceId: seeded.priceId,
    });

    expect(result).toEqual({ ok: true });
    expect(await seeded.readSelectedPriceId()).toBe(seeded.priceId);
    expect(await readAllocated(seeded)).toBe(1000);
    expect(await readPool(seeded)).toBe(poolBefore - 1000);
  });

  test("Asignar dinero refuses a row of a list that does not price the inscription", async () => {
    const seeded = await kind.seed();

    const result = await allocate(seeded, {
      amount: 1000,
      priceId: seeded.foreignPriceId,
    });

    expect(result).toEqual({
      message: inscriptionMoneyRefusals.unknownPriceRow,
      ok: false,
    });
    expect(await seeded.readSelectedPriceId()).toBeNull();
    expect(await readAllocated(seeded)).toBe(0);
  });

  test("the price is fixed at the crossing, and taking money off opens it again", async () => {
    const seeded = await kind.seed();
    await fund(seeded, kind.depositAmount);

    await expect(
      allocate(seeded, { amount: 1000, priceId: seeded.otherPriceId }),
    ).resolves.toEqual({
      message: inscriptionMoneyRefusals.priceFixed,
      ok: false,
    });
    expect(await seeded.readSelectedPriceId()).toBe(seeded.priceId);
    expect(await readAllocated(seeded)).toBe(kind.depositAmount);

    // Naming the row it holds, or none, is no change of price.
    await expect(
      allocate(seeded, { amount: 1, priceId: seeded.priceId }),
    ).resolves.toEqual({ ok: true });
    await expect(
      allocate(seeded, { amount: 1, priceId: null }),
    ).resolves.toEqual({ ok: true });

    await removeFromInscription({ ...scopeOf(seeded), amount: 3 });

    await expect(
      allocate(seeded, { amount: 1, priceId: seeded.otherPriceId }),
    ).resolves.toEqual({ ok: true });
    expect(await seeded.readSelectedPriceId()).toBe(seeded.otherPriceId);
  });

  test("with no pick, a row that holds nothing and stores nothing has to name a price", async () => {
    const seeded = await kind.seed();

    await expect(
      allocate(seeded, { amount: 1000, priceId: null }),
    ).resolves.toEqual({
      message: inscriptionMoneyRefusals.pickPrice,
      ok: false,
    });
    expect(await readAllocated(seeded)).toBe(0);
  });

  test("with no pick, a stored row of its own list keeps pricing a row below its deposit", async () => {
    const seeded = await kind.seed();
    await allocate(seeded, { amount: 1000, priceId: seeded.otherPriceId });

    await expect(
      allocate(seeded, { amount: 1000, priceId: null }),
    ).resolves.toEqual({ ok: true });
    expect(await seeded.readSelectedPriceId()).toBe(seeded.otherPriceId);
    expect(await readAllocated(seeded)).toBe(2000);
  });

  test("with no pick over a stored row of another list, the row in effect replaces it", async () => {
    const seeded = await kind.seed();
    await seeded.storePrice(seeded.foreignPriceId);

    await expect(
      allocate(seeded, { amount: 1000, priceId: null }),
    ).resolves.toEqual({ ok: true });
    expect(await seeded.readSelectedPriceId()).toBe(seeded.priceId);
    expect(await readAllocated(seeded)).toBe(1000);
  });

  test("a pool that runs dry rolls the pick back along with the money", async () => {
    const seeded = await kind.seed();
    await fund(seeded, 1000);
    await seeded.fundPool(1500);

    const result = await allocate(seeded, {
      amount: 1000,
      priceId: seeded.otherPriceId,
    });

    expect(result).toMatchObject({ ok: false });
    expect(await seeded.readSelectedPriceId()).toBe(seeded.priceId);
    expect(await readAllocated(seeded)).toBe(1000);
    expect(await readPool(seeded)).toBe(500);
  });

  test("Quitar dinero gives the amount back to the pool and the figures follow what is left", async () => {
    const seeded = await kind.seed();
    await fund(seeded, kind.depositAmount);
    const poolBefore = await readPool(seeded);

    const result = await removeFromInscription({
      ...scopeOf(seeded),
      amount: 1000,
    });

    expect(result).toEqual({ ok: true });
    expect(await readAllocated(seeded)).toBe(kind.depositAmount - 1000);
    expect(await readPool(seeded)).toBe(poolBefore + 1000);
    expect(await readFigures(seeded)).toMatchObject({
      financialStatus: "depositPending",
      owedDepositAmount: 1000,
    });
  });

  test("a refused Quitar dinero leaves the money where it was", async () => {
    const seeded = await kind.seed();
    await fund(seeded, kind.depositAmount);
    const poolBefore = await readPool(seeded);

    const result = await removeFromInscription({
      ...scopeOf(seeded),
      amount: kind.depositAmount + 1,
    });

    expect(result).toMatchObject({ ok: false });
    expect(await readAllocated(seeded)).toBe(kind.depositAmount);
    expect(await readPool(seeded)).toBe(poolBefore);
  });

  test("releases exactly what the row holds above its Total", async () => {
    const seeded = await kind.seed();
    await fund(seeded, kind.totalAmount);
    await seeded.reprice(kind.totalAmount - 2000);
    const poolBefore = await readPool(seeded);

    const result = await releaseInscriptionExcess(scopeOf(seeded));

    expect(result).toEqual({ ok: true });
    expect(await readAllocated(seeded)).toBe(kind.totalAmount - 2000);
    expect(await readPool(seeded)).toBe(poolBefore + 2000);
    expect(await readFigures(seeded)).toMatchObject({
      financialStatus: "paidInFull",
      overAllocatedAmount: 0,
    });
  });

  test("refuses to release an excess the row does not have", async () => {
    const seeded = await kind.seed();
    await fund(seeded, kind.totalAmount);

    await expect(releaseInscriptionExcess(scopeOf(seeded))).resolves.toEqual({
      message: inscriptionMoneyRefusals.noExcess,
      ok: false,
    });
    expect(await readAllocated(seeded)).toBe(kind.totalAmount);
  });

  test("refuses the retained release on a row that is not withdrawn", async () => {
    const seeded = await kind.seed();
    await fund(seeded, kind.depositAmount);

    await expect(
      releaseRetainedInscriptionDeposit(scopeOf(seeded)),
    ).resolves.toEqual({
      message: inscriptionMoneyRefusals.notWithdrawn,
      ok: false,
    });
    expect(await readAllocated(seeded)).toBe(kind.depositAmount);
  });

  test("a withdrawn row refuses anything between keeping and releasing all of it", async () => {
    const seeded = await kind.seed();
    await fund(seeded, kind.depositAmount);
    await seeded.withdraw();
    const refused = {
      message: inscriptionMoneyRefusals.partialRetainedRelease,
      ok: false,
    };

    await expect(
      removeFromInscription({ ...scopeOf(seeded), amount: 1000 }),
    ).resolves.toEqual(refused);
    await expect(releaseInscriptionExcess(scopeOf(seeded))).resolves.toEqual(
      refused,
    );
    expect(await readAllocated(seeded)).toBe(kind.depositAmount);
  });

  test("the retained release gives everything a withdrawn row holds back to the pool", async () => {
    const seeded = await kind.seed();
    await fund(seeded, kind.depositAmount + 1000);
    await seeded.withdraw();
    const poolBefore = await readPool(seeded);

    const result = await releaseRetainedInscriptionDeposit(scopeOf(seeded));

    expect(result).toEqual({ ok: true });
    expect(await readAllocated(seeded)).toBe(0);
    expect(await readPool(seeded)).toBe(poolBefore + kind.depositAmount + 1000);
  });

  test("the retained release refuses a withdrawn row that holds nothing", async () => {
    const seeded = await kind.seed();
    await seeded.withdraw();

    await expect(
      releaseRetainedInscriptionDeposit(scopeOf(seeded)),
    ).resolves.toMatchObject({ ok: false });
  });

  describe.each(gestures)("$name", (gesture) => {
    test("moves nothing on a row of another academy, event or none at all", async () => {
      const seeded = await kind.seed();
      await fund(seeded, kind.totalAmount);
      await seeded.reprice(kind.totalAmount - 2000);
      const scope = scopeOf(seeded);

      await expect(
        gesture.run({ ...scope, academyId: crypto.randomUUID() }),
      ).resolves.toEqual({ message: kind.refusedForAcademy, ok: false });
      await expect(
        gesture.run({ ...scope, eventId: crypto.randomUUID() }),
      ).resolves.toEqual({ message: kind.refusedForEvent, ok: false });
      await expect(
        gesture.run({
          ...scope,
          target: { ...scope.target, id: crypto.randomUUID() },
        }),
      ).resolves.toEqual({
        message: inscriptionMoneyRefusals.inscriptionNotFound,
        ok: false,
      });
      expect(await readAllocated(seeded)).toBe(kind.totalAmount);
    });
  });
});

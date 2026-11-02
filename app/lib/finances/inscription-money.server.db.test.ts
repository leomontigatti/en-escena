import { eq } from "drizzle-orm";
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
import { allocateToInscription } from "@/lib/finances/inscription-allocation.server";
import { deriveInscriptionFinancialFigures } from "@/lib/finances/inscription-financial-status";
import {
  releaseInscriptionExcess,
  releaseRetainedInscriptionDeposit,
  removeFromInscription,
} from "@/lib/finances/inscription-money.server";
import { inscriptionMoneyRefusals } from "@/lib/finances/inscription-money-refusals";
import { allocateToSeminarInscription } from "@/lib/finances/seminar-inscription-allocation.server";
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
  eventId: string;
  /** Puts money on the row through the kind's own allocation. */
  fund: (amount: number) => Promise<void>;
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
    depositAmount: 3000,
    kind: "choreography",
    refusedForEvent: choreographyNotFoundMessage,
    refusedForAcademy: choreographyNotFoundMessage,
    seed: seedChoreographyInscription,
    totalAmount: 10000,
  },
  {
    depositAmount: 10000,
    kind: "seminar",
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
    eventId: event.id,
    fund: async (amount) => {
      expectAccepted(
        await allocateToInscription({
          academyId,
          amount,
          choreographyId: choreography.id,
          eventId: event.id,
          inscriptionId: inscription!.id,
          priceId: price!.id,
        }),
      );
    },
    reprice: async (amount) => {
      await db.update(prices).set({ amount }).where(eq(prices.id, price!.id));
    },
    target: { id: inscription!.id, kind: "choreography" },
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

  return {
    academyId: fixture.northAcademyId,
    eventId: fixture.eventId,
    fund: async (amount) => {
      expectAccepted(
        await allocateToSeminarInscription({
          academyId: fixture.northAcademyId,
          amount,
          eventId: fixture.eventId,
          inscriptionId,
          now: new Date(),
          priceId: fixture.priceId,
          seminarId: fixture.abrilSeminarId,
        }),
      );
    },
    reprice: async (amount) => {
      await db
        .update(seminarPrices)
        .set({ amount })
        .where(eq(seminarPrices.id, fixture.priceId));
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

function expectAccepted(result: { ok: boolean }) {
  expect(result).toEqual({ ok: true });
}

function scopeOf(seeded: SeededInscription) {
  return {
    academyId: seeded.academyId,
    eventId: seeded.eventId,
    target: seeded.target,
  };
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

/** The three gestures, for the refusals that hold for every one of them. */
const gestures = [
  {
    name: "Quitar dinero",
    run: (scope: ReturnType<typeof scopeOf>) =>
      removeFromInscription({ ...scope, amount: 1000 }),
  },
  { name: "the excess release", run: releaseInscriptionExcess },
  { name: "the retained release", run: releaseRetainedInscriptionDeposit },
];

describe.each(kinds)("the money gestures on a $kind inscription", (kind) => {
  test("Quitar dinero gives the amount back to the pool and the figures follow what is left", async () => {
    const seeded = await kind.seed();
    await seeded.fund(kind.depositAmount);
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
    await seeded.fund(kind.depositAmount);
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
    await seeded.fund(kind.totalAmount);
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
    await seeded.fund(kind.totalAmount);

    await expect(releaseInscriptionExcess(scopeOf(seeded))).resolves.toEqual({
      message: inscriptionMoneyRefusals.noExcess,
      ok: false,
    });
    expect(await readAllocated(seeded)).toBe(kind.totalAmount);
  });

  test("refuses the retained release on a row that is not withdrawn", async () => {
    const seeded = await kind.seed();
    await seeded.fund(kind.depositAmount);

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
    await seeded.fund(kind.depositAmount);
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
    await seeded.fund(kind.depositAmount + 1000);
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
      await seeded.fund(kind.totalAmount);
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

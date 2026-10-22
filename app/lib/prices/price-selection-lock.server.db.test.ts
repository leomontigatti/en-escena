import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  priceSchedules,
  prices,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import {
  createAcademyFinanceChoreographyFixture,
  registerPaymentForTest,
} from "@/lib/admin/finances/finances.test-support";
import { createSavedSchedule } from "@/lib/events/bases.test-support";
import { payChoreographiesPreset } from "@/lib/finances/choreography-cobro-presets.server";
import type { Transaction } from "@/lib/finances/choreography-cobro-support.server";
import { allocateToInscription } from "@/lib/finances/inscription-allocation.server";
import {
  frozenPriceDeleteError,
  frozenSpecialPriceUpdateError,
  uncoveredPriceDeleteError,
} from "@/lib/prices/guards";
import { lockEventPrices } from "@/lib/prices/price-list-lock.server";
import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import { deletePrice, updatePrice } from "@/lib/prices/repository.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
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
 * Editing or deleting a price and storing it on an inscription (#1331) lock the
 * same price row, so whichever comes second sees what the first committed: an
 * edit behind a crossing finds the price stored and refuses, a crossing behind
 * an edit validates against the edited row and refuses when it no longer
 * covers the inscription. Each test holds the lock in its own transaction,
 * standing in for the side that got there first, and commits it once the side
 * under test is queued behind it.
 *
 * The fast suite runs everything through a single PGlite connection, which
 * serialises the transactions on its own, so this runs on Postgres only.
 */
describe.skipIf(isPgliteTestBackend())(
  "price edits against the crossing that stores the price",
  () => {
    describe("an edit queued behind a crossing", () => {
      test("refuses changing the amount of the price it stored", async () => {
        const fixture = await seedFixture();

        const edit = await whileHoldingThePrice(
          fixture.specialPriceId,
          () =>
            updatePrice(fixture.specialPriceId, {
              ...fixture.specialPriceInput,
              amount: 12000,
            }),
          (tx) => storeThePrice(tx, fixture),
        );

        expect(edit).toMatchObject({
          ok: false,
          code: "event-bases-has-dependencies",
          error: frozenSpecialPriceUpdateError,
        });
        await expect(readPriceAmount(fixture.specialPriceId)).resolves.toBe(
          8000,
        );
      });

      test("refuses dropping the schedule its inscription sits on", async () => {
        const fixture = await seedFixture();

        const edit = await whileHoldingThePrice(
          fixture.specialPriceId,
          () =>
            updatePrice(fixture.specialPriceId, {
              ...fixture.specialPriceInput,
              scheduleIds: [fixture.otherScheduleId],
            }),
          (tx) => storeThePrice(tx, fixture),
        );

        expect(edit).toMatchObject({
          ok: false,
          code: "event-bases-has-dependencies",
          fieldErrors: { scheduleIds: "Revisá los cronogramas del precio." },
        });
        await expect(
          readCoveredScheduleIds(fixture.specialPriceId),
        ).resolves.toContain(fixture.scheduleId);
      });

      test("refuses deleting the price it stored", async () => {
        const fixture = await seedFixture();

        const removal = await whileHoldingThePrice(
          fixture.specialPriceId,
          () => deletePrice(fixture.specialPriceId),
          (tx) => storeThePrice(tx, fixture),
        );

        expect(removal).toEqual({
          ok: false,
          code: "event-bases-has-dependencies",
          error: frozenPriceDeleteError,
        });
        await expect(readPriceAmount(fixture.specialPriceId)).resolves.toBe(
          8000,
        );
      });
    });

    describe("a crossing queued behind an edit", () => {
      test("refuses allocating against a price deleted in the meantime", async () => {
        const fixture = await seedFixture();

        const allocation = await whileHoldingThePrice(
          fixture.specialPriceId,
          () => allocateTheDeposit(fixture),
          (tx) =>
            tx.delete(prices).where(eq(prices.id, fixture.specialPriceId)),
        );

        expect(allocation).toEqual({
          ok: false,
          message: "No encontramos esa fila de precio.",
        });
        await expectNothingStored(fixture);
      });

      test("refuses allocating against a price that stopped covering the schedule", async () => {
        const fixture = await seedFixture();

        const allocation = await whileHoldingThePrice(
          fixture.specialPriceId,
          () => allocateTheDeposit(fixture),
          (tx) => dropTheSchedule(tx, fixture),
        );

        expect(allocation).toEqual({
          ok: false,
          message: "No encontramos esa fila de precio.",
        });
        await expectNothingStored(fixture);
      });

      test("refuses a preset against a price that stopped covering the schedule", async () => {
        const fixture = await seedFixture();

        const preset = await whileHoldingThePrice(
          fixture.specialPriceId,
          () =>
            payChoreographiesPreset({
              academyId: fixture.academyId,
              choreographyIds: [fixture.choreographyId],
              eventId: fixture.eventId,
              priceIdByGroupType: { solo: fixture.specialPriceId },
              stage: "deposit",
            }),
          (tx) => dropTheSchedule(tx, fixture),
        );

        expect(preset).toEqual({
          ok: false,
          message:
            "Esa fila de precio no corresponde a la coreografía elegida.",
        });
        await expectNothingStored(fixture);
      });
    });
  },
);

/**
 * Deleting a group type's general row with no deadline refuses while the group
 * type has an active inscription, a fact a registration or a draft save can be
 * committing while the deletion runs. They take the event's price list shared
 * and the deletion takes it exclusive, so a deletion queued behind one sees the
 * inscription it made active. The registration's side is
 * `registration-confirmation.server.db.test.ts`; Postgres only, as above.
 */
describe.skipIf(isPgliteTestBackend())(
  "price deletions against a write that makes an inscription active",
  () => {
    test("refuses removing the general row the new inscription needs", async () => {
      const event = await createSavedEvent({ requiredDepositPercentage: 30 });
      // A choreography with no dancer yet: no active solo inscription until
      // the holder adds one.
      const { academy, choreography } =
        await createAcademyFinanceChoreographyFixture({
          academyName: "Academia Carrera",
          email: `carrera.${crypto.randomUUID()}@example.com`,
          choreographyName: "Aire",
          event,
        });
      const dancer = await createDancer(academy.academy.id);
      const [tail] = await insertTestPrices([
        {
          eventId: event.id,
          name: "Precio Solo",
          groupType: "solo",
          amount: 12000,
          paymentDeadline: null,
        },
      ]);

      const removal = await runBehindAHolder({
        waitingOn: "choreography price list lock",
        hold: (tx) => lockEventPrices(tx, event.id),
        contender: () => deletePrice(tail.id),
        // What the registration inserts under the lock.
        beforeCommit: (tx) =>
          tx.insert(choreographyDancers).values({
            ageAtEventStart: 14,
            choreographyId: choreography.id,
            dancerId: dancer.id,
          }),
      });

      expect(removal).toEqual({
        ok: false,
        code: "event-bases-has-dependencies",
        error: uncoveredPriceDeleteError,
      });
      await expect(readPriceAmount(tail.id)).resolves.toBe(12000);
    });
  },
);

type Fixture = Awaited<ReturnType<typeof seedFixture>>;

/**
 * One `solo` inscription with money in the academy's pool, and a special price
 * of 8000 covering the inscription's schedule and one more, so dropping the
 * inscription's schedule leaves the price special.
 */
async function seedFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, catalog, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Carrera",
      email: `carrera.${crypto.randomUUID()}@example.com`,
      choreographyName: "Aire",
      event,
    });
  const otherSchedule = await createSavedSchedule(event.id, {
    name: "Sábado tarde",
    startTime: "14:00",
    modalityIds: [catalog.modality.id],
  });
  const dancer = await createDancer(academy.academy.id);
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();
  const specialPriceInput = {
    name: "Precio especial",
    groupType: "solo" as const,
    amount: 8000,
    paymentDeadline: "2026-05-31",
    scheduleIds: [catalog.schedule.id, otherSchedule.id].sort(),
  };
  const [specialPrice] = await insertTestPrices([
    { eventId: event.id, ...specialPriceInput },
  ]);

  await registerPaymentForTest({
    academyId: academy.academy.id,
    amount: "10000",
    eventId: event.id,
    paymentDate: "2026-04-01",
  });

  return {
    academyId: academy.academy.id,
    choreographyId: choreography.id,
    eventId: event.id,
    inscriptionId: inscription.id,
    otherScheduleId: otherSchedule.id,
    scheduleId: catalog.schedule.id,
    specialPriceId: specialPrice.id,
    specialPriceInput,
  };
}

/**
 * Runs `contender` behind a transaction holding the price row `FOR UPDATE`,
 * which runs `holderWrite` and commits once `contender` waits on it.
 */
function whileHoldingThePrice<T>(
  priceId: string,
  contender: () => Promise<T>,
  holderWrite: (tx: Transaction) => Promise<unknown>,
): Promise<T> {
  return runBehindAHolder({
    waitingOn: "price row lock",
    hold: (tx) =>
      tx
        .select({ id: prices.id })
        .from(prices)
        .where(eq(prices.id, priceId))
        .for("update"),
    contender,
    beforeCommit: holderWrite,
  });
}

/** What a crossing writes: the price, stored on the inscription. */
async function storeThePrice(tx: Transaction, fixture: Fixture) {
  await tx
    .update(choreographyDancers)
    .set({ selectedPriceId: fixture.specialPriceId })
    .where(eq(choreographyDancers.id, fixture.inscriptionId));
}

/** What an edit that drops the inscription's schedule writes. */
async function dropTheSchedule(tx: Transaction, fixture: Fixture) {
  await tx
    .delete(priceSchedules)
    .where(
      and(
        eq(priceSchedules.priceId, fixture.specialPriceId),
        eq(priceSchedules.scheduleId, fixture.scheduleId),
      ),
    );
}

function allocateTheDeposit(fixture: Fixture) {
  return allocateToInscription({
    academyId: fixture.academyId,
    amount: 2400,
    choreographyId: fixture.choreographyId,
    eventId: fixture.eventId,
    inscriptionId: fixture.inscriptionId,
    priceId: fixture.specialPriceId,
  });
}

async function expectNothingStored(fixture: Fixture) {
  await expect(
    db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.id, fixture.inscriptionId)),
  ).resolves.toEqual([{ selectedPriceId: null }]);
  await expect(
    db
      .select({ id: paymentAllocations.id })
      .from(paymentAllocations)
      .where(
        eq(paymentAllocations.choreographyInscriptionId, fixture.inscriptionId),
      ),
  ).resolves.toEqual([]);
}

async function readPriceAmount(priceId: string) {
  const [row] = await db
    .select({ amount: prices.amount })
    .from(prices)
    .where(eq(prices.id, priceId));

  return row?.amount;
}

async function readCoveredScheduleIds(priceId: string) {
  const rows = await db
    .select({ scheduleId: priceSchedules.scheduleId })
    .from(priceSchedules)
    .where(eq(priceSchedules.priceId, priceId));

  return rows.map((row) => row.scheduleId);
}

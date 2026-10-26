import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  paymentAllocations,
  seminarInscriptions,
  seminarPrices,
} from "@/db/schema";
import {
  seedSeminarPresetFixture,
  type SeminarPresetFixture,
} from "@/lib/admin/finances/seminar-finances.test-support";
import type { Transaction } from "@/lib/finances/choreography-cobro-support.server";
import { paySeminarsPreset } from "@/lib/finances/seminar-cobro-presets.server";
import { allocateToSeminarInscription } from "@/lib/finances/seminar-inscription-allocation.server";
import {
  frozenPriceDeleteError,
  frozenPriceUpdateError,
} from "@/lib/prices/guards";
import {
  lockEventSeminarPrices,
  lockEventSeminarPricesForEdit,
} from "@/lib/seminar-prices/price-locks.server";
import {
  deleteSeminarPrice,
  updateSeminarPrice,
} from "@/lib/seminar-prices/repository.server";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../tests/db/harness";
import { runBehindAHolder } from "../../../tests/db/lock-contention";

installDatabaseTestHooks();

/**
 * Changing an event's seminar prices and storing one on a seminar inscription
 * serialise on the event's price list, so whichever comes second sees what the
 * first committed: an edit behind a write that stores the price finds it
 * stored and refuses, and a write behind an edit charges by the edited list, or
 * refuses a row that is gone. Each test holds the lock in its own transaction,
 * standing in for the side that got there first, and commits once the side
 * under test is queued behind it.
 *
 * The fast suite runs everything through a single PGlite connection, which
 * serialises the transactions on its own, so this runs on Postgres only.
 */
describe.skipIf(isPgliteTestBackend())(
  "seminar price edits against the writes that store the price",
  () => {
    describe("an edit queued behind a write that stores the price", () => {
      test("refuses changing the amount of the price it stored", async () => {
        const fixture = await seedSeminarPresetFixture({ paymentAmount: 0 });
        const priceId = fixture.priceId("regular", true);

        const edit = await runBehindAHolder({
          waitingOn: "seminar price list lock",
          hold: (tx) => lockEventSeminarPrices(tx, fixture.eventId),
          contender: () =>
            updateSeminarPrice(priceId, {
              name: "regular participante",
              kind: "regular",
              forParticipants: true,
              paymentDeadline: null,
              amount: 24000,
            }),
          beforeCommit: (tx) => storeThePrice(tx, fixture, priceId),
        });

        expect(edit).toEqual({
          ok: false,
          code: "event-bases-has-dependencies",
          error: frozenPriceUpdateError,
        });
        await expect(readPriceAmount(priceId)).resolves.toBe(20000);
      });

      test("refuses deleting the price it stored", async () => {
        const fixture = await seedSeminarPresetFixture({ paymentAmount: 0 });
        const priceId = fixture.earlyBirdId;

        const removal = await runBehindAHolder({
          waitingOn: "seminar price list lock",
          hold: (tx) => lockEventSeminarPrices(tx, fixture.eventId),
          contender: () => deleteSeminarPrice(priceId),
          beforeCommit: (tx) => storeThePrice(tx, fixture, priceId),
        });

        expect(removal).toEqual({
          ok: false,
          code: "event-bases-has-dependencies",
          error: frozenPriceDeleteError,
        });
        await expect(readPriceAmount(priceId)).resolves.toBe(44000);
      });
    });

    describe("a write queued behind an edit", () => {
      test("`Pagar seña` charges the deposit of the edited amount", async () => {
        const fixture = await seedSeminarPresetFixture({
          paymentAmount: 100000,
        });
        const priceId = fixture.priceId("regular", true);

        const preset = await runBehindAHolder({
          waitingOn: "seminar price list lock",
          hold: (tx) => lockEventSeminarPricesForEdit(tx, fixture.eventId),
          contender: () =>
            paySeminarsPreset({
              now: new Date(),
              academyId: fixture.academyId,
              eventId: fixture.eventId,
              seminarIds: [fixture.regular.id],
              stage: "deposit",
            }),
          beforeCommit: (tx) =>
            tx
              .update(seminarPrices)
              .set({ amount: 24000 })
              .where(eq(seminarPrices.id, priceId)),
        });

        expect(preset).toEqual({ ok: true });
        // Half of the edited 24000, not of the 20000 the row held before.
        await expect(
          readAllocated(fixture.inscriptions.regularParticipant.id),
        ).resolves.toBe(12000);
        await expect(
          readStoredPriceId(fixture.inscriptions.regularParticipant.id),
        ).resolves.toBe(priceId);
      });

      test("`Pagar seña` charges by a row created in the meantime", async () => {
        const fixture = await seedSeminarPresetFixture({
          paymentAmount: 100000,
        });

        const preset = await runBehindAHolder({
          waitingOn: "seminar price list lock",
          hold: (tx) => lockEventSeminarPricesForEdit(tx, fixture.eventId),
          contender: () =>
            paySeminarsPreset({
              now: new Date(),
              academyId: fixture.academyId,
              eventId: fixture.eventId,
              seminarIds: [fixture.regular.id],
              stage: "deposit",
            }),
          // A dated row of the participant cell, so it is the one that applies
          // today.
          beforeCommit: (tx) =>
            tx.insert(seminarPrices).values({
              amount: 24000,
              eventId: fixture.eventId,
              forParticipants: true,
              kind: "regular",
              name: "Preventa participante",
              paymentDeadline: "2099-12-31",
            }),
        });

        expect(preset).toEqual({ ok: true });
        await expect(
          readAllocated(fixture.inscriptions.regularParticipant.id),
        ).resolves.toBe(12000);
        await expect(
          readStoredPriceName(fixture.inscriptions.regularParticipant.id),
        ).resolves.toBe("Preventa participante");
      });

      test("the allocation dialog refuses a price deleted in the meantime", async () => {
        const fixture = await seedSeminarPresetFixture({
          paymentAmount: 100000,
        });
        const priceId = fixture.earlyBirdId;
        const inscription = fixture.inscriptions.specialOutsider;

        const allocation = await runBehindAHolder({
          waitingOn: "seminar price list lock",
          hold: (tx) => lockEventSeminarPricesForEdit(tx, fixture.eventId),
          contender: () =>
            allocateToSeminarInscription({
              now: new Date(),
              academyId: fixture.academyId,
              amount: 22000,
              eventId: fixture.eventId,
              inscriptionId: inscription.id,
              priceId,
              seminarId: fixture.special.id,
            }),
          beforeCommit: (tx) =>
            tx.delete(seminarPrices).where(eq(seminarPrices.id, priceId)),
        });

        expect(allocation).toEqual({
          ok: false,
          message: "No encontramos esa fila de precio.",
        });
        await expect(readStoredPriceId(inscription.id)).resolves.toBeNull();
        await expect(readAllocated(inscription.id)).resolves.toBe(0);
      });
    });
  },
);

/** What a write that prices an inscription stores. */
async function storeThePrice(
  tx: Transaction,
  fixture: SeminarPresetFixture,
  priceId: string,
) {
  await tx
    .update(seminarInscriptions)
    .set({ selectedPriceId: priceId })
    .where(eq(seminarInscriptions.id, fixture.inscriptions.specialOutsider.id));
}

async function readPriceAmount(priceId: string) {
  const [row] = await db
    .select({ amount: seminarPrices.amount })
    .from(seminarPrices)
    .where(eq(seminarPrices.id, priceId));

  return row?.amount;
}

async function readStoredPriceId(inscriptionId: string) {
  const [row] = await db
    .select({ selectedPriceId: seminarInscriptions.selectedPriceId })
    .from(seminarInscriptions)
    .where(eq(seminarInscriptions.id, inscriptionId));

  return row?.selectedPriceId;
}

async function readStoredPriceName(inscriptionId: string) {
  const [row] = await db
    .select({ name: seminarPrices.name })
    .from(seminarInscriptions)
    .innerJoin(
      seminarPrices,
      eq(seminarPrices.id, seminarInscriptions.selectedPriceId),
    )
    .where(eq(seminarInscriptions.id, inscriptionId));

  return row?.name;
}

async function readAllocated(inscriptionId: string) {
  const rows = await db
    .select({ amount: paymentAllocations.amount })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.seminarInscriptionId, inscriptionId));

  return rows.reduce((sum, row) => sum + row.amount, 0);
}

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { prices } from "@/db/schema";
import {
  createEventPriceFixture,
  createSavedPrice,
} from "@/lib/events/bases-test-fixtures.server.db";
import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import { createPrice, updatePrice } from "@/lib/prices/repository.server";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../tests/db/harness";
import { runBehindAHolder } from "../../../tests/db/lock-contention";

installDatabaseTestHooks();

const generalDuplicate = {
  ok: false,
  code: "duplicate-name",
  error: "Ya existe un precio general para ese tipo de grupo.",
  fieldErrors: { groupType: "Revisá el tipo de grupo del precio." },
};

/**
 * Two saves of colliding prices (#1331) both pass the duplicate pre-check when
 * neither has committed, and the unique constraints refuse the one that comes
 * second. That refusal has to come back as the duplicate-price failure the
 * pre-check would have given, not as an unhandled error. Each test inserts the
 * colliding row in a transaction left open, so the save under test misses it
 * in the pre-check and waits on the unique index until it commits.
 *
 * The fast suite runs everything through a single PGlite connection, which
 * serialises the transactions on its own, so this runs on Postgres only.
 */
describe.skipIf(isPgliteTestBackend())(
  "a price save that loses the race to a colliding one",
  () => {
    test("creating a general price answers with the duplicate failure", async () => {
      const { event } = await createEventPriceFixture();

      const save = await behindAnUncommittedPrice(
        { eventId: event.id, name: "Precio base" },
        () =>
          createPrice(event.id, {
            groupType: "solo",
            amount: 9000,
            paymentDeadline: "2026-05-31",
            scheduleIds: [],
          }),
      );

      expect(save).toEqual(generalDuplicate);
      await expect(countPrices(event.id)).resolves.toBe(1);
    });

    test("moving a general price onto a taken deadline answers with the duplicate failure", async () => {
      const { event } = await createEventPriceFixture();
      const later = await createSavedPrice(event.id, {
        paymentDeadline: "2026-06-30",
      });

      const save = await behindAnUncommittedPrice(
        { eventId: event.id, name: "Precio base" },
        () =>
          updatePrice(later.id, {
            groupType: "solo",
            amount: 12000,
            paymentDeadline: "2026-05-31",
            scheduleIds: [],
          }),
      );

      expect(save).toEqual(generalDuplicate);
      await expect(
        db
          .select({ paymentDeadline: prices.paymentDeadline })
          .from(prices)
          .where(eq(prices.id, later.id)),
      ).resolves.toEqual([{ paymentDeadline: "2026-06-30" }]);
    });

    test("creating a special price answers with the duplicate failure naming the schedule", async () => {
      const { event, schedule } = await createEventPriceFixture();

      const save = await behindAnUncommittedPrice(
        {
          eventId: event.id,
          name: "Precio especial",
          scheduleIds: [schedule.id],
        },
        () =>
          createPrice(event.id, {
            groupType: "solo",
            amount: 9000,
            paymentDeadline: "2026-05-31",
            scheduleIds: [schedule.id],
          }),
      );

      expect(save).toEqual({
        ok: false,
        code: "duplicate-name",
        error: `Ya existe un precio especial para ese tipo de grupo y fecha límite en Sábado Mañana.`,
        fieldErrors: { scheduleIds: "Revisá los cronogramas del precio." },
      });
      await expect(countPrices(event.id)).resolves.toBe(1);
    });

    test("adding a taken schedule to a special price answers with the duplicate failure", async () => {
      const { event, schedule } = await createEventPriceFixture();
      const special = await createSavedPrice(event.id, {
        name: "Precio especial",
        scheduleIds: [schedule.id],
        paymentDeadline: "2026-06-30",
      });

      const save = await behindAnUncommittedPrice(
        {
          eventId: event.id,
          name: "Otro precio especial",
          scheduleIds: [schedule.id],
        },
        () =>
          updatePrice(special.id, {
            name: "Precio especial",
            groupType: "solo",
            amount: 12000,
            paymentDeadline: "2026-05-31",
            scheduleIds: [schedule.id],
          }),
      );

      expect(save).toMatchObject({
        ok: false,
        code: "duplicate-name",
        fieldErrors: { scheduleIds: "Revisá los cronogramas del precio." },
      });
      await expect(
        db
          .select({ paymentDeadline: prices.paymentDeadline })
          .from(prices)
          .where(eq(prices.id, special.id)),
      ).resolves.toEqual([{ paymentDeadline: "2026-06-30" }]);
    });
  },
);

/**
 * Runs `save` while a `solo` price with the 2026-05-31 deadline sits inserted
 * in a transaction nobody has committed yet, and commits it once `save` waits
 * on the unique index.
 */
function behindAnUncommittedPrice<T>(
  price: { eventId: string; name: string; scheduleIds?: string[] },
  save: () => Promise<T>,
): Promise<T> {
  return runBehindAHolder({
    waitingOn: "colliding price",
    hold: (tx) =>
      insertTestPrices(
        [
          {
            ...price,
            groupType: "solo",
            amount: 10000,
            paymentDeadline: "2026-05-31",
          },
        ],
        tx,
      ),
    contender: save,
  });
}

async function countPrices(eventId: string) {
  const rows = await db
    .select({ id: prices.id })
    .from(prices)
    .where(eq(prices.eventId, eventId));

  return rows.length;
}

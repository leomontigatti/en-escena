import { eq, inArray } from "drizzle-orm";
import { expect, test } from "vitest";

import { db } from "@/db";
import { paymentAllocations, seminarPrices, seminars } from "@/db/schema";
import { seedSeminarPresetFixture } from "@/lib/admin/finances/seminar-finances.test-support";
import { chargeThreshold } from "@/lib/finances/inscription-money.server";
import { readSeminarPlaceLedgers } from "@/lib/seminars/seminar-places.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

test("takes a peso at the deposit stage of a row whose deposit rounds to nothing, which takes the place", async () => {
  const fixture = await seedSeminarPresetFixture({ paymentAmount: 100 });
  const { regularOutsider, regularParticipant } = fixture.inscriptions;
  await db
    .update(seminars)
    .set({ requiredDepositPercentage: 10 })
    .where(eq(seminars.id, fixture.regular.id));
  await db
    .update(seminarPrices)
    .set({ amount: 4 })
    .where(
      inArray(seminarPrices.id, [
        fixture.priceId("regular", true),
        fixture.priceId("regular", false),
      ]),
    );

  const result = await chargeThreshold({
    kind: "seminar",
    academyId: fixture.academyId,
    eventId: fixture.eventId,
    now: new Date(),
    seminarIds: [fixture.regular.id],
    stage: "deposit",
  });

  expect(result).toEqual({ ok: true });
  const allocations = await db
    .select({ amount: paymentAllocations.amount })
    .from(paymentAllocations)
    .where(
      inArray(paymentAllocations.seminarInscriptionId, [
        regularOutsider.id,
        regularParticipant.id,
      ]),
    );
  expect(allocations).toEqual([{ amount: 1 }, { amount: 1 }]);
  const ledgers = await readSeminarPlaceLedgers(db, {
    now: new Date(),
    seminarIds: [fixture.regular.id],
  });
  expect(ledgers.get(fixture.regular.id)?.coveredCount).toBe(2);
});

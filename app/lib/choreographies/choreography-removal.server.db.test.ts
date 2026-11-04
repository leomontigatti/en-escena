import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations } from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
} from "@/features/portal/choreographies/test-support/db";
import { removeChoreography } from "@/lib/choreographies/choreography-removal.server";
import { spreadFromPool } from "@/lib/finances/allocation-pool.server";
import { choreographyTarget } from "@/lib/finances/allocation-target.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { createAcademyUser } from "@/lib/test-support/academies";
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
 * One inscription of a `solo` choreography at the catalogue price (10000, a
 * 3000 deposit), and a payment of 5000 the academy has not allocated yet.
 */
async function seedUnfundedInscription() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const academy = await createAcademyUser({
    academyName: "Academia Carrera",
    email: `carrera.${crypto.randomUUID()}@example.com`,
  });
  const academyId = academy.academy.id;
  const catalog = await createEventCatalog(event.id);
  const choreography = await createChoreographyRecord({
    academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Carrera solo",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });
  const dancer = await createDancer(academyId, {
    firstName: "Ana",
    lastName: "Carrera",
  });
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning({ id: choreographyDancers.id });
  await registerAcademyEventPayment({
    academyId,
    amount: 5000,
    eventId: event.id,
    internalNote: null,
    paymentDate: "2026-04-01",
    paymentMethod: "transferencia",
    reference: null,
  });

  return {
    academyId,
    choreographyId: choreography.id,
    eventId: event.id,
    inscriptionId: inscription!.id,
  };
}

describe.skipIf(isPgliteTestBackend())(
  "removing a choreography racing an allocation",
  () => {
    // #1689: the evidence was read before the inscriptions were locked, so an
    // allocation still uncommitted read as no evidence, and the delete's
    // cascade took it once it committed.
    test("withdraws the choreography and keeps the money an allocation committed while it waited", async () => {
      const fixture = await seedUnfundedInscription();

      const outcome = await runBehindAHolder({
        waitingOn: "inscription lock",
        // The pool writer every allocation goes through: it locks the
        // inscription and inserts the allocation, and commits once the removal
        // is queued behind it.
        hold: async (tx) => {
          const funded = await spreadFromPool(tx, {
            academyId: fixture.academyId,
            amount: 2000,
            eventId: fixture.eventId,
            target: choreographyTarget(fixture.inscriptionId),
          });
          expect(funded).toEqual({ ok: true });
        },
        contender: () => removeChoreography(fixture.choreographyId),
      });

      expect(outcome).toBe("withdrawn");
      const [inscription] = await db
        .select({ withdrawnAt: choreographyDancers.withdrawnAt })
        .from(choreographyDancers)
        .where(eq(choreographyDancers.id, fixture.inscriptionId));
      expect(inscription?.withdrawnAt).toBeInstanceOf(Date);
      // Below the deposit of 3000, so the withdrawal retains all of it.
      await expect(
        db
          .select({ amount: paymentAllocations.amount })
          .from(paymentAllocations)
          .where(
            eq(
              paymentAllocations.choreographyInscriptionId,
              fixture.inscriptionId,
            ),
          ),
      ).resolves.toEqual([{ amount: 2000 }]);
    });
  },
);

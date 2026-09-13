import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  payments,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { readSeminarInscriptionThresholds } from "@/lib/finances/seminar-inscription-thresholds.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { hasCoveredSeminarInscription } from "@/lib/seminars/covered-inscriptions.server";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
} from "../admin/finances/finances.test-support";

installDatabaseTestHooks();

const prices = {
  regularParticipant: 20000,
  regularOutsider: 30000,
  specialParticipant: 40000,
  specialOutsider: 50000,
};

/**
 * An event whose own deposit rate (30 %) differs from its seminar's (50 %), a
 * full four-cell price list, and two academies: one whose dancer also dances in
 * the event and one whose dancer does not. Every figure asserted below is
 * therefore the seminar's, and the participant cell is decided by the roster row
 * alone.
 */
async function seedSeminarPricingFixture(
  options: { seminarKind?: "regular" | "special" } = {},
) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const dancing = await createAcademyFinanceChoreographyFixture({
    academyName: "Academia Bailando",
    choreographyName: "Aire",
    email: `bailando.${crypto.randomUUID()}@example.com`,
    event,
  });
  const watching = await createAcademyUser({
    academyName: "Academia Mirando",
    email: `mirando.${crypto.randomUUID()}@example.com`,
  });

  const participant = await createDancer(dancing.academy.academy.id, {
    firstName: "Ana",
    lastName: "Bailando",
  });
  const outsider = await createDancer(watching.academyId, {
    firstName: "Ana",
    lastName: "Mirando",
  });

  // What makes the first dancer `Participando`: a live choreography inscription
  // in the event, whatever its money.
  await db.insert(choreographyDancers).values({
    ageAtEventStart: 14,
    choreographyId: dancing.choreography.id,
    dancerId: participant.id,
  });

  const [seminar] = await db
    .insert(seminars)
    .values({
      eventId: event.id,
      instructorName: "Abril Sosa",
      kind: options.seminarKind ?? "special",
      quota: 20,
      requiredDepositPercentage: 50,
      scheduledDate: "2030-10-10",
      startTime: "18:30",
    })
    .returning();

  const priceIds = new Map<keyof typeof prices, string>();
  for (const [cell, amount] of Object.entries(prices)) {
    const [row] = await db
      .insert(seminarPrices)
      .values({
        amount,
        eventId: event.id,
        forParticipants: cell.endsWith("Participant"),
        kind: cell.startsWith("special") ? "special" : "regular",
        name: `Precio ${cell}`,
        paymentDeadline: null,
      })
      .returning();

    priceIds.set(cell as keyof typeof prices, row.id);
  }

  const [participantInscription] = await db
    .insert(seminarInscriptions)
    .values({ dancerId: participant.id, seminarId: seminar.id })
    .returning();
  const [outsiderInscription] = await db
    .insert(seminarInscriptions)
    .values({ dancerId: outsider.id, seminarId: seminar.id })
    .returning();

  return {
    dancingAcademyId: dancing.academy.academy.id,
    eventId: event.id,
    outsiderInscriptionId: outsiderInscription.id,
    participantInscriptionId: participantInscription.id,
    priceIds,
    seminarId: seminar.id,
    watchingAcademyId: watching.academyId,
  };
}

function readThresholds(
  fixture: Awaited<ReturnType<typeof seedSeminarPricingFixture>>,
) {
  return readSeminarInscriptionThresholds(db, {
    academyId: fixture.dancingAcademyId,
    eventId: fixture.eventId,
    inscriptionIds: [
      fixture.participantInscriptionId,
      fixture.outsiderInscriptionId,
    ],
  });
}

async function allocate(input: {
  academyId: string;
  amount: number;
  eventId: string;
  inscriptionId: string;
  paymentNumber: number;
}) {
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: input.academyId,
      amount: input.amount,
      eventId: input.eventId,
      paymentDate: "2030-04-01",
      paymentMethod: "transferencia",
      paymentNumber: input.paymentNumber,
    })
    .returning();

  await db.insert(paymentAllocations).values({
    academyId: input.academyId,
    amount: input.amount,
    eventId: input.eventId,
    paymentId: payment.id,
    seminarInscriptionId: input.inscriptionId,
  });
}

describe.sequential("seminar inscription thresholds", () => {
  test("prices each person from the rows of their own cell, at the seminar's own rate", async () => {
    const fixture = await seedSeminarPricingFixture();

    const thresholds = await readThresholds(fixture);

    // The participant takes the `Exclusivo` participant row, never the
    // non-participant one, and the deposit is half of it — the seminar's 50 %,
    // not the event's 30 %.
    expect(thresholds.get(fixture.participantInscriptionId)).toMatchObject({
      depositAmount: prices.specialParticipant / 2,
      totalAmount: prices.specialParticipant,
    });
    expect(thresholds.get(fixture.participantInscriptionId)?.priceRow?.id).toBe(
      fixture.priceIds.get("specialParticipant"),
    );

    // The second dancer is a roster row of another academy with no choreography
    // of her own: same person by name, non-participant by roster.
    expect(thresholds.get(fixture.outsiderInscriptionId)).toMatchObject({
      depositAmount: prices.specialOutsider / 2,
      totalAmount: prices.specialOutsider,
    });
  });

  test("falls back to the `Común` rows of the same cell when the kind has none", async () => {
    const fixture = await seedSeminarPricingFixture();
    await db
      .delete(seminarPrices)
      .where(eq(seminarPrices.id, fixture.priceIds.get("specialParticipant")!));

    const thresholds = await readThresholds(fixture);

    // The participant falls back along the kind axis and never along the
    // participant one: 20000, not the `Exclusivo` non-participant's 50000.
    expect(thresholds.get(fixture.participantInscriptionId)).toMatchObject({
      depositAmount: prices.regularParticipant / 2,
      totalAmount: prices.regularParticipant,
    });
  });

  test("reads an inscription no row prices as having no price", async () => {
    const fixture = await seedSeminarPricingFixture();
    await db
      .delete(seminarPrices)
      .where(eq(seminarPrices.eventId, fixture.eventId));

    const thresholds = await readThresholds(fixture);

    expect(thresholds.get(fixture.participantInscriptionId)).toMatchObject({
      covered: false,
      depositAmount: null,
      totalAmount: null,
    });
  });

  test("covers the inscription only once its stored row's deposit is reached", async () => {
    const fixture = await seedSeminarPricingFixture();
    await db
      .update(seminarInscriptions)
      .set({ selectedPriceId: fixture.priceIds.get("specialParticipant") })
      .where(eq(seminarInscriptions.id, fixture.participantInscriptionId));

    await allocate({
      academyId: fixture.dancingAcademyId,
      amount: prices.specialParticipant / 2 - 1,
      eventId: fixture.eventId,
      inscriptionId: fixture.participantInscriptionId,
      paymentNumber: 1,
    });

    expect(
      (await readThresholds(fixture)).get(fixture.participantInscriptionId)
        ?.covered,
    ).toBe(false);
    await expect(hasCoveredSeminarInscription(fixture.seminarId)).resolves.toBe(
      false,
    );

    await allocate({
      academyId: fixture.dancingAcademyId,
      amount: 1,
      eventId: fixture.eventId,
      inscriptionId: fixture.participantInscriptionId,
      paymentNumber: 2,
    });

    expect(
      (await readThresholds(fixture)).get(fixture.participantInscriptionId)
        ?.covered,
    ).toBe(true);
    await expect(hasCoveredSeminarInscription(fixture.seminarId)).resolves.toBe(
      true,
    );

    // Withdrawal keeps the money and gives the place back, so the same money
    // covers nothing.
    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: new Date("2030-05-01T12:00:00Z") })
      .where(eq(seminarInscriptions.id, fixture.participantInscriptionId));

    expect(
      (await readThresholds(fixture)).get(fixture.participantInscriptionId)
        ?.covered,
    ).toBe(false);
    await expect(hasCoveredSeminarInscription(fixture.seminarId)).resolves.toBe(
      false,
    );
  });
});

describe.sequential("the academy's figures over both kinds", () => {
  test("sums the seminar unit into the owed figures and leaves the balance available alone", async () => {
    const fixture = await seedSeminarPricingFixture({
      seminarKind: "regular",
    });

    const detail = await readAcademyEventOperationalFinanceDetail({
      academyId: fixture.dancingAcademyId,
      eventId: fixture.eventId,
    });

    const [seminarRow] = detail.seminarFinanceRows;

    expect(seminarRow).toMatchObject({
      id: fixture.seminarId,
      instructorName: "Abril Sosa",
      financialStatus: "depositPending",
      registrationCount: 1,
      scheduledDate: "2030-10-10",
    });
    expect(seminarRow.owedDepositAmount).toEqual({
      amount: prices.regularParticipant / 2,
      status: "complete",
    });

    // One debt against one pool: the seminar's owed figures sit inside the same
    // totals as the choreography's, and nothing was paid, so the pool is empty.
    const choreographyOwed = detail.choreographyFinanceRows.reduce(
      (total, row) => total + row.owedDepositAmount.amount,
      0,
    );

    expect(detail.summary.owedDepositAmount.amount).toBe(
      choreographyOwed + prices.regularParticipant / 2,
    );
    expect(detail.summary.availableBalanceAmount).toBe(0);
    expect(detail.summary.totalPaidAmount).toBe(0);
  });

  test("keeps a withdrawn seminar row in the money and out of the count and the status", async () => {
    const fixture = await seedSeminarPricingFixture({ seminarKind: "regular" });
    await db
      .update(seminarInscriptions)
      .set({
        selectedPriceId: fixture.priceIds.get("regularParticipant"),
        withdrawnAt: new Date("2030-05-01T12:00:00Z"),
      })
      .where(eq(seminarInscriptions.id, fixture.participantInscriptionId));
    await allocate({
      academyId: fixture.dancingAcademyId,
      amount: prices.regularParticipant / 2,
      eventId: fixture.eventId,
      inscriptionId: fixture.participantInscriptionId,
      paymentNumber: 1,
    });

    const detail = await readAcademyEventOperationalFinanceDetail({
      academyId: fixture.dancingAcademyId,
      eventId: fixture.eventId,
    });
    const [seminarRow] = detail.seminarFinanceRows;

    expect(seminarRow).toMatchObject({
      allocatedAmount: prices.regularParticipant / 2,
      registrationCount: 0,
    });
    // Nothing is owed on a withdrawn row, and the unit has no active row left
    // to lower its status below the empty reading.
    expect(seminarRow.owedDepositAmount).toEqual({
      amount: 0,
      status: "complete",
    });
    expect(seminarRow.financialStatus).toBe("depositPending");
  });
});

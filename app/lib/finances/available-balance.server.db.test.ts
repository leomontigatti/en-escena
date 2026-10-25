import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers, payments } from "@/db/schema";
import {
  createDancer,
  createEventCatalog,
} from "@/features/portal/choreographies/test-support/db";
import {
  createAcademyFinanceChoreographyFixture,
  registerPaymentForTest,
} from "@/lib/admin/finances/finances.test-support";
import { spreadFromPool } from "@/lib/finances/allocation-pool.server";
import { choreographyTarget } from "@/lib/finances/allocation-target.server";
import {
  paymentAvailableAmountSql,
  readAvailableBalance,
  readAvailableBalances,
} from "@/lib/finances/available-balance.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

/**
 * An academy with a `solo` inscription at the catalogue price (10000), the
 * given payments numbered from 1, and the given amount funded onto the
 * inscription through the pool (oldest payment first).
 */
async function seedOwnerPool(input: {
  academyName: string;
  catalog?: Awaited<ReturnType<typeof createEventCatalog>>;
  event: Awaited<ReturnType<typeof createSavedEvent>>;
  fundedAmount: number;
  paymentAmounts: number[];
}) {
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: input.academyName,
      catalog: input.catalog,
      choreographyName: `${input.academyName} solo`,
      email: `${crypto.randomUUID()}@example.com`,
      event: input.event,
    });
  const academyId = academy.academy.id;
  const dancer = await createDancer(academyId, {
    firstName: "Ana",
    lastName: input.academyName,
  });
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();

  for (const [index, amount] of input.paymentAmounts.entries()) {
    await registerPaymentForTest({
      academyId,
      amount: String(amount),
      eventId: input.event.id,
      paymentDate: `2026-04-0${index + 1}`,
    });
  }

  if (input.fundedAmount > 0) {
    const funded = await db.transaction((tx) =>
      spreadFromPool(tx, {
        academyId,
        amount: input.fundedAmount,
        eventId: input.event.id,
        target: choreographyTarget(inscription!.id),
      }),
    );
    expect(funded).toEqual({ ok: true });
  }

  return { academyId };
}

describe("readAvailableBalance", () => {
  test("reads each payment's `Disponible` summing to the owner's `Saldo disponible`", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academyId } = await seedOwnerPool({
      academyName: "Academia Saldo",
      event,
      fundedAmount: 2500,
      paymentAmounts: [1000, 2000, 3000],
    });

    const balance = await readAvailableBalance(db, {
      academyId,
      eventId: event.id,
    });

    expect(
      balance.payments.map((payment) => [
        payment.paymentNumber,
        payment.allocatedAmount,
        payment.paymentAvailableAmount,
      ]),
    ).toEqual([
      [1, 1000, 0],
      [2, 1500, 500],
      [3, 0, 3000],
    ]);
    expect(balance.availableBalanceAmount).toBe(3500);
  });

  test("keeps each owner's pool to its own payments and allocations in the event", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const otherEvent = await createSavedEvent({
      active: false,
      requiredDepositPercentage: 30,
    });
    const catalog = await createEventCatalog(event.id);
    const first = await seedOwnerPool({
      academyName: "Academia Uno",
      catalog,
      event,
      fundedAmount: 1200,
      paymentAmounts: [2000],
    });
    const second = await seedOwnerPool({
      academyName: "Academia Dos",
      catalog,
      event,
      fundedAmount: 0,
      paymentAmounts: [700, 300],
    });
    await registerPaymentForTest({
      academyId: first.academyId,
      amount: "9000",
      eventId: otherEvent.id,
      paymentDate: "2026-04-05",
    });
    const academyWithoutPayments =
      await createAcademyFinanceChoreographyFixture({
        academyName: "Academia Sin Pagos",
        catalog,
        choreographyName: "Sin pagos solo",
        email: `${crypto.randomUUID()}@example.com`,
        event,
      });

    const balances = await readAvailableBalances(db, {
      academyIds: [
        first.academyId,
        second.academyId,
        academyWithoutPayments.academy.academy.id,
      ],
      eventId: event.id,
    });

    expect(
      Object.fromEntries(
        [...balances].map(([academyId, balance]) => [
          academyId,
          balance.availableBalanceAmount,
        ]),
      ),
    ).toEqual({
      [first.academyId]: 800,
      [second.academyId]: 1000,
      [academyWithoutPayments.academy.academy.id]: 0,
    });
  });

  test("the payments list's SQL `Disponible` agrees with the split", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academyId } = await seedOwnerPool({
      academyName: "Academia SQL",
      event,
      fundedAmount: 3200,
      paymentAmounts: [1000, 2000, 3000],
    });

    const [balance, sqlRows] = await Promise.all([
      readAvailableBalance(db, { academyId, eventId: event.id }),
      db
        .select({
          paymentAvailableAmount: paymentAvailableAmountSql,
          paymentId: payments.id,
        })
        .from(payments)
        .where(eq(payments.academyId, academyId))
        .orderBy(asc(payments.paymentNumber)),
    ]);

    expect(
      sqlRows.map((row) => ({
        paymentAvailableAmount: Number(row.paymentAvailableAmount),
        paymentId: row.paymentId,
      })),
    ).toEqual(
      balance.payments.map(({ paymentAvailableAmount, paymentId }) => ({
        paymentAvailableAmount,
        paymentId,
      })),
    );
  });
});

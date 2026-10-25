import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { payments } from "@/db/schema";
import { createEventCatalog } from "@/features/portal/choreographies/test-support/db";
import {
  createAcademyFinanceChoreographyFixture,
  registerPaymentForTest,
  registerRefundForTest,
  seedOwnerPoolForTest,
} from "@/lib/admin/finances/finances.test-support";
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

describe("readAvailableBalance", () => {
  test("reads each payment's `Disponible` summing to the owner's `Saldo disponible`", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academyId } = await seedOwnerPoolForTest({
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

  test("subtracts the owner's refunds, drawn on the newest payments' free money first", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academyId } = await seedOwnerPoolForTest({
      academyName: "Academia Reembolso",
      event,
      fundedAmount: 2500,
      paymentAmounts: [1000, 2000, 3000],
    });
    await registerRefundForTest({ academyId, amount: 2000, eventId: event.id });
    await registerRefundForTest({ academyId, amount: 1200, eventId: event.id });

    const balance = await readAvailableBalance(db, {
      academyId,
      eventId: event.id,
    });

    expect(
      balance.payments.map((payment) => [
        payment.paymentNumber,
        payment.paymentAvailableAmount,
      ]),
    ).toEqual([
      [1, 0],
      [2, 300],
      [3, 0],
    ]);
    expect(balance.availableBalanceAmount).toBe(300);
  });

  test("keeps each owner's pool to its own payments and allocations in the event", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const otherEvent = await createSavedEvent({
      active: false,
      requiredDepositPercentage: 30,
    });
    const catalog = await createEventCatalog(event.id);
    const first = await seedOwnerPoolForTest({
      academyName: "Academia Uno",
      catalog,
      event,
      fundedAmount: 1200,
      paymentAmounts: [2000],
    });
    const second = await seedOwnerPoolForTest({
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
    await registerRefundForTest({
      academyId: first.academyId,
      amount: 4000,
      eventId: otherEvent.id,
    });
    await registerRefundForTest({
      academyId: second.academyId,
      amount: 250,
      eventId: event.id,
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
      [second.academyId]: 750,
      [academyWithoutPayments.academy.academy.id]: 0,
    });
  });

  test("the payments list's SQL `Disponible` agrees with the split", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academyId } = await seedOwnerPoolForTest({
      academyName: "Academia SQL",
      event,
      fundedAmount: 1200,
      paymentAmounts: [1000, 2000, 3000, 500],
    });
    // Free money is [0, 1800, 3000, 500]: the refund empties the two newest
    // payments and draws the rest from the second.
    await registerRefundForTest({ academyId, amount: 4000, eventId: event.id });

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
      balance.payments.map((payment) => payment.paymentAvailableAmount),
    ).toEqual([0, 1300, 0, 0]);

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

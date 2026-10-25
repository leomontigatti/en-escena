import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { payments, refunds } from "@/db/schema";
import {
  registerPaymentForTest,
  registerRefundForTest,
  seedOwnerPoolForTest,
} from "@/lib/admin/finances/finances.test-support";
import {
  lockAcademyPools,
  spreadFromPool,
} from "@/lib/finances/allocation-pool.server";
import { choreographyTarget } from "@/lib/finances/allocation-target.server";
import { readAcademyAvailableBalance } from "@/lib/finances/available-balance.server";
import {
  registerRefund,
  type RegisterRefundInput,
} from "@/lib/finances/refunds.server";
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

function refundOf(
  pool: { academyId: string; eventId: string },
  amount: number,
): RegisterRefundInput {
  return {
    ...pool,
    amount,
    internalNote: "Se retiró del evento",
    reference: "TRX-R1",
    refundDate: "2026-04-09",
    refundMethod: "transferencia",
  };
}

async function readRefunds(academyId: string) {
  return await db
    .select()
    .from(refunds)
    .where(eq(refunds.academyId, academyId))
    .orderBy(asc(refunds.refundNumber));
}

describe("registerRefund", () => {
  test("accepts a refund of exactly the `Saldo disponible` and refuses one peso more", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academyId } = await seedOwnerPoolForTest({
      academyName: "Academia Tope",
      event,
      fundedAmount: 1500,
      paymentAmounts: [2000, 1000],
    });
    const pool = { academyId, eventId: event.id };

    await expect(registerRefund(refundOf(pool, 1501))).resolves.toEqual({
      ok: false,
      message: "El reembolso no puede superar el saldo disponible de $ 1.500.",
    });
    await expect(registerRefund(refundOf(pool, 1500))).resolves.toMatchObject({
      ok: true,
      refundNumber: 1,
    });
    await expect(registerRefund(refundOf(pool, 1))).resolves.toEqual({
      ok: false,
      message: "No hay saldo disponible para reembolsar.",
    });

    await expect(readRefunds(academyId)).resolves.toMatchObject([
      {
        amount: 1500,
        eventId: event.id,
        internalNote: "Se retiró del evento",
        reference: "TRX-R1",
        refundDate: "2026-04-09",
        refundMethod: "transferencia",
        refundNumber: 1,
      },
    ]);
    await expect(readAcademyAvailableBalance(db, pool)).resolves.toBe(0);
  });

  test("checks the cap against the live balance, not the one read when the dialog opened", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academyId, inscriptionId } = await seedOwnerPoolForTest({
      academyName: "Academia En Vivo",
      event,
      fundedAmount: 0,
      paymentAmounts: [3000],
    });
    const pool = { academyId, eventId: event.id };
    const balanceWhenOpened = await readAcademyAvailableBalance(db, pool);

    await db.transaction((tx) =>
      spreadFromPool(tx, {
        ...pool,
        amount: 1000,
        target: choreographyTarget(inscriptionId),
      }),
    );

    await expect(
      registerRefund(refundOf(pool, balanceWhenOpened)),
    ).resolves.toMatchObject({ ok: false });
    await expect(readRefunds(academyId)).resolves.toEqual([]);
  });

  test("numbers refunds per event, in a series of their own beside the payments'", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const otherEvent = await createSavedEvent({
      active: false,
      requiredDepositPercentage: 30,
    });
    const { academyId } = await seedOwnerPoolForTest({
      academyName: "Academia Series",
      event,
      fundedAmount: 0,
      paymentAmounts: [5000, 5000],
    });
    await registerPaymentForTest({
      academyId,
      amount: "5000",
      eventId: otherEvent.id,
      paymentDate: "2026-04-05",
    });

    await registerRefundForTest({ academyId, amount: 100, eventId: event.id });
    await registerRefundForTest({
      academyId,
      amount: 100,
      eventId: otherEvent.id,
    });
    await registerRefundForTest({ academyId, amount: 100, eventId: event.id });
    await registerPaymentForTest({
      academyId,
      amount: "5000",
      eventId: event.id,
      paymentDate: "2026-04-06",
    });

    expect(
      (await readRefunds(academyId)).map((refund) => [
        refund.eventId,
        refund.refundNumber,
      ]),
    ).toEqual([
      [event.id, 1],
      [otherEvent.id, 1],
      [event.id, 2],
    ]);
    expect(
      (
        await db
          .select({ paymentNumber: payments.paymentNumber })
          .from(payments)
          .where(
            and(
              eq(payments.academyId, academyId),
              eq(payments.eventId, event.id),
            ),
          )
          .orderBy(asc(payments.paymentNumber))
      ).map((payment) => payment.paymentNumber),
    ).toEqual([1, 2, 3]);
  });
});

/**
 * Only the pool lock orders two refunds on one pool; one PGlite connection
 * would order them on its own, so this runs on Postgres only.
 */
describe.skipIf(isPgliteTestBackend())("a refund under real contention", () => {
  test("of two refunds that together exceed the pool, the one that waited is refused", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academyId } = await seedOwnerPoolForTest({
      academyName: "Academia Carrera",
      event,
      fundedAmount: 0,
      paymentAmounts: [3000],
    });
    const pool = { academyId, eventId: event.id };

    const result = await runBehindAHolder({
      waitingOn: "academy pool lock",
      hold: async (tx) => {
        await lockAcademyPools(tx, [pool]);
        await tx.insert(refunds).values({
          ...pool,
          amount: 2000,
          refundDate: "2026-04-09",
          refundMethod: "efectivo",
          refundNumber: 1,
        });
      },
      contender: () => registerRefund(refundOf(pool, 2000)),
    });

    expect(result).toMatchObject({ ok: false });
    expect(
      (await readRefunds(academyId)).map((refund) => refund.amount),
    ).toEqual([2000]);
  });
});

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
  deleteRefund,
  registerRefund,
  updateRefund,
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

async function readRefund(refundId: string) {
  const [refund] = await db
    .select()
    .from(refunds)
    .where(eq(refunds.id, refundId));

  if (!refund) {
    throw new Error("Expected the refund to exist.");
  }

  return { ...refund, version: refund.updatedAt.toISOString() };
}

/** A pool of 3000 paid, nothing funded, and one refund of 1000 drawn on it. */
async function seedRefundedPool() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academyId } = await seedOwnerPoolForTest({
    academyName: "Academia Correcciones",
    event,
    fundedAmount: 0,
    paymentAmounts: [3000],
  });
  const pool = { academyId, eventId: event.id };
  const { refundId } = await registerRefundForTest({ ...pool, amount: 1000 });

  return { pool, refund: await readRefund(refundId) };
}

function editOf(
  refund: Awaited<ReturnType<typeof readRefund>>,
  changes: Partial<Parameters<typeof updateRefund>[0]> = {},
): Parameters<typeof updateRefund>[0] {
  return {
    amount: refund.amount,
    internalNote: refund.internalNote,
    reference: refund.reference,
    refundDate: refund.refundDate,
    refundId: refund.id,
    refundMethod: refund.refundMethod,
    version: refund.version,
    ...changes,
  };
}

const changedWhileSaving = {
  ok: false,
  message:
    "El reembolso cambió mientras se guardaba. Revisalo y volvé a intentarlo.",
};

describe("updateRefund", () => {
  test("caps a raise at the `Saldo disponible` plus the refund's own amount", async () => {
    const { pool, refund } = await seedRefundedPool();

    await expect(
      updateRefund(editOf(refund, { amount: 3001 })),
    ).resolves.toEqual({
      ok: false,
      message:
        "El reembolso no puede superar $ 3.000, el saldo disponible más su monto actual.",
    });
    await expect(readRefund(refund.id)).resolves.toMatchObject({
      amount: 1000,
    });

    await expect(
      updateRefund(editOf(refund, { amount: 3000 })),
    ).resolves.toEqual({ ok: true });
    await expect(readAcademyAvailableBalance(db, pool)).resolves.toBe(0);
  });

  test("always accepts lowering or keeping the amount, even with nothing free", async () => {
    const { pool, refund } = await seedRefundedPool();
    await registerRefundForTest({ ...pool, amount: 2000 });

    await expect(updateRefund(editOf(refund))).resolves.toEqual({ ok: true });
    const kept = await readRefund(refund.id);
    await expect(updateRefund(editOf(kept, { amount: 400 }))).resolves.toEqual({
      ok: true,
    });
    await expect(readAcademyAvailableBalance(db, pool)).resolves.toBe(600);
  });

  test("saves every editable field and leaves academy, event and number as they were", async () => {
    const { pool, refund } = await seedRefundedPool();

    await expect(
      updateRefund(
        editOf(refund, {
          amount: 800,
          internalNote: null,
          reference: "TRX-R2",
          refundDate: "2026-04-10",
          refundMethod: "efectivo",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    await expect(readRefund(refund.id)).resolves.toMatchObject({
      academyId: pool.academyId,
      amount: 800,
      eventId: pool.eventId,
      internalNote: null,
      reference: "TRX-R2",
      refundDate: "2026-04-10",
      refundMethod: "efectivo",
      refundNumber: refund.refundNumber,
    });
  });

  test("refuses an edit over a refund someone else changed or deleted meanwhile", async () => {
    const { refund } = await seedRefundedPool();

    await expect(
      updateRefund(editOf(refund, { amount: 900 })),
    ).resolves.toEqual({ ok: true });
    await expect(
      updateRefund(editOf(refund, { amount: 700 })),
    ).resolves.toEqual(changedWhileSaving);
    await expect(readRefund(refund.id)).resolves.toMatchObject({ amount: 900 });

    await db.delete(refunds).where(eq(refunds.id, refund.id));
    await expect(updateRefund(editOf(refund))).resolves.toEqual(
      changedWhileSaving,
    );
  });
});

describe("deleteRefund", () => {
  test("raises the `Saldo disponible` by exactly the refund's amount", async () => {
    const { pool, refund } = await seedRefundedPool();
    await registerRefundForTest({ ...pool, amount: 2000 });
    await expect(readAcademyAvailableBalance(db, pool)).resolves.toBe(0);

    await expect(
      deleteRefund({ refundId: refund.id, version: refund.version }),
    ).resolves.toEqual({ ok: true });

    await expect(readAcademyAvailableBalance(db, pool)).resolves.toBe(1000);
    await expect(readRefunds(pool.academyId)).resolves.toMatchObject([
      { amount: 2000 },
    ]);
  });

  test("refuses a deletion over a refund someone else changed or deleted meanwhile", async () => {
    const { refund } = await seedRefundedPool();
    await updateRefund(editOf(refund, { amount: 900 }));

    await expect(
      deleteRefund({ refundId: refund.id, version: refund.version }),
    ).resolves.toEqual(changedWhileSaving);
    await expect(readRefund(refund.id)).resolves.toMatchObject({ amount: 900 });

    const current = await readRefund(refund.id);
    await deleteRefund({ refundId: current.id, version: current.version });
    await expect(
      deleteRefund({ refundId: current.id, version: current.version }),
    ).resolves.toEqual(changedWhileSaving);
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

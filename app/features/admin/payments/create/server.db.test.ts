import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { events, payments, refunds } from "@/db/schema";
import { expectFlashRedirect } from "@/lib/shared/flash-notification.test-support";
import * as businessTimeZone from "@/lib/shared/business-time-zone";

import {
  academyFinancesRouteArgs,
  academyFinancesUrl,
  buildGlobalPaymentRequest,
  seedOwnerPoolForTest,
} from "@/lib/admin/finances/finances.test-support";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";
import { loader as academyFinancesLoader } from "@/routes/administracion.finanzas_.$academyId";
import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { handleMovementCreateAction } from "./server";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

const createUrl = "http://localhost/administracion/movimientos/nuevo";

describe("admin movement create", () => {
  test("registers a payment and redirects to its detail with a flash toast", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.pago.nuevo@example.com",
      academyName: "Academia Pago Nuevo",
    });
    const { request } = await buildGlobalPaymentRequest({
      academyId: academy.academy.id,
      amount: "5000",
      internalNote: "Seña inicial",
      paymentDate: "2026-03-15",
      paymentMethod: "transferencia",
      reference: "TRX-100",
      requestUrl: createUrl,
      role: "admin",
    });

    const response = await expectThrownFlashRedirect(request);

    const payment = await db.query.payments.findFirst({
      where: eq(payments.academyId, academy.academy.id),
    });

    expect(payment).toMatchObject({
      eventId: event.id,
      academyId: academy.academy.id,
    });
    await expectFlashRedirect(
      response,
      `/administracion/movimientos/pagos/${payment?.id}`,
      {
        id: "route-notification:payment-recorded",
        message: "Pago registrado.",
        variant: "success",
      },
    );
  });
});

describe("registering a refund", () => {
  test("saves it against the active event and returns to the list, since a refund has no page", async () => {
    const pool = await seedPool();
    const { request } = await buildGlobalPaymentRequest(
      refundInput(pool, { amount: "3000" }),
    );

    await expectFlashRedirect(
      await expectThrownFlashRedirect(request),
      "/administracion/movimientos",
      {
        id: "route-notification:refund-recorded",
        message: "Reembolso registrado.",
        variant: "success",
      },
    );
    await expect(readRefunds(pool.academyId)).resolves.toMatchObject([
      {
        amount: 3000,
        eventId: pool.eventId,
        internalNote: "Se retiró",
        reference: "TRX-R1",
        refundDate: "2026-04-09",
        refundMethod: "efectivo",
        refundNumber: 1,
      },
    ]);
  });

  test("answers for an individual as for an academy", async () => {
    const event = await createSavedEvent();
    const individual = await createIndividualUser({
      email: `${crypto.randomUUID()}@example.com`,
    });
    const { request: paymentRequest } = await buildGlobalPaymentRequest({
      academyId: individual.ownerId,
      amount: "2000",
      paymentDate: "2026-04-01",
      paymentMethod: "transferencia",
      requestUrl: createUrl,
      role: "admin",
    });
    await expectThrownFlashRedirect(paymentRequest);
    const { request } = await buildGlobalPaymentRequest(
      refundInput({ academyId: individual.ownerId }, { amount: "2000" }),
    );

    await expectThrownFlashRedirect(request);

    await expect(readRefunds(individual.ownerId)).resolves.toMatchObject([
      { amount: 2000, eventId: event.id },
    ]);
  });

  test("moves nothing but the `Saldo disponible`: no inscription's money, status or billing", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academyId } = await seedOwnerPoolForTest({
      academyName: "Academia Intacta",
      event,
      fundedAmount: 3000,
      paymentAmounts: [5000],
    });
    const readPage = async () => {
      const { request } = await createSignedInRequest({
        email: `${crypto.randomUUID()}@example.com`,
        requestUrl: academyFinancesUrl(academyId, event.id),
        role: "admin",
      });

      return await academyFinancesLoader(
        academyFinancesRouteArgs(request, academyId),
      );
    };
    const before = await readPage();
    const { request } = await buildGlobalPaymentRequest(
      refundInput({ academyId }, { amount: "2000" }),
    );

    await expectThrownFlashRedirect(request);

    const after = await readPage();

    expect(after.choreographyFinanceRows).toEqual(
      before.choreographyFinanceRows,
    );
    expect(after.inscriptions).toEqual(before.inscriptions);
    expect(after.bulkEmission).toEqual(before.bulkEmission);
    expect(after.summary).toEqual({
      ...before.summary,
      availableBalanceAmount: before.summary.availableBalanceAmount - 2000,
    });
  });

  test("answers an amount above the `Saldo disponible` as the submit's refusal, keeping what was typed", async () => {
    const pool = await seedPool();
    const { request } = await buildGlobalPaymentRequest(
      refundInput(pool, { amount: "3001" }),
    );

    await expect(handleMovementCreateAction(request)).resolves.toMatchObject({
      fieldErrors: {},
      message: "El reembolso no puede superar el saldo disponible de $ 3.000.",
      status: "error",
      values: { amount: "3001", movementKind: "refund" },
    });
    await expect(readRefunds(pool.academyId)).resolves.toEqual([]);
  });

  test("refuses a future date and an amount that is not whole pesos", async () => {
    const pool = await seedPool();

    for (const [field, fields, message] of [
      [
        "paymentDate",
        { paymentDate: "2026-04-11" },
        "La fecha no puede ser futura.",
      ],
      [
        "amount",
        { amount: "10.5" },
        "Ingresá un monto entero en pesos, sin centavos.",
      ],
    ] as const) {
      const { request } = await buildGlobalPaymentRequest(
        refundInput(pool, fields),
      );

      await expect(handleMovementCreateAction(request)).resolves.toMatchObject({
        fieldErrors: { [field]: message },
        status: "error",
      });
    }
    await expect(readRefunds(pool.academyId)).resolves.toEqual([]);
  });

  test("refuses to register without an active event", async () => {
    const pool = await seedPool();
    await db.update(events).set({ active: false });
    const { request } = await buildGlobalPaymentRequest(refundInput(pool));

    await expect(handleMovementCreateAction(request)).resolves.toMatchObject({
      message: "Activá un evento para registrar movimientos.",
      status: "error",
    });
    await expect(readRefunds(pool.academyId)).resolves.toEqual([]);
  });

  test("refuses the auditor, an academy and an individual", async () => {
    const pool = await seedPool();
    const academy = await createAcademyUser({
      academyName: "Academia Portal",
      email: `${crypto.randomUUID()}@example.com`,
    });
    const individual = await createIndividualUser({
      email: `${crypto.randomUUID()}@example.com`,
    });
    const { request: auditorRequest } = await buildGlobalPaymentRequest({
      ...refundInput(pool),
      role: "auditor",
    });

    await expect(
      handleMovementCreateAction(auditorRequest),
    ).rejects.toMatchObject({ status: 403 });

    for (const cookie of [academy.cookie, individual.cookie]) {
      const { request } = await buildGlobalPaymentRequest(refundInput(pool));
      const body = await request.formData();

      await expect(
        handleMovementCreateAction(
          new Request(createUrl, { body, headers: { cookie }, method: "POST" }),
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(readRefunds(pool.academyId)).resolves.toEqual([]);
  });
});

function refundInput(
  pool: { academyId: string },
  fields: { amount?: string; paymentDate?: string } = {},
) {
  return {
    academyId: pool.academyId,
    amount: fields.amount ?? "1000",
    internalNote: "Se retiró",
    movementKind: "refund" as const,
    paymentDate: fields.paymentDate ?? "2026-04-09",
    paymentMethod: "efectivo",
    reference: "TRX-R1",
    requestUrl: createUrl,
    role: "admin" as const,
  };
}

async function seedPool() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academyId } = await seedOwnerPoolForTest({
    academyName: "Academia Reembolsos",
    event,
    fundedAmount: 0,
    paymentAmounts: [3000],
  });

  return { academyId, eventId: event.id };
}

async function readRefunds(academyId: string) {
  return await db
    .select()
    .from(refunds)
    .where(eq(refunds.academyId, academyId));
}

async function expectThrownFlashRedirect(request: Request): Promise<Response> {
  try {
    await handleMovementCreateAction(request);
  } catch (thrown) {
    if (thrown instanceof Response) {
      return thrown;
    }

    throw thrown;
  }

  throw new Error("Expected the movement create action to throw a redirect.");
}

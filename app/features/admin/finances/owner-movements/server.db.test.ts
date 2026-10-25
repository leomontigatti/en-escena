import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  academyFinancesRouteArgs,
  academyFinancesUrl,
  registerPaymentForTest,
  registerRefundForTest,
  seedOwnerPoolForTest,
} from "@/lib/admin/finances/finances.test-support";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";
import { loader as academyFinancesLoader } from "@/routes/administracion.finanzas_.$academyId";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

async function loadOwnerPage(academyId: string, eventId: string) {
  const { request } = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: academyFinancesUrl(academyId, eventId),
    role: "admin",
  });

  return await academyFinancesLoader(
    academyFinancesRouteArgs(request, academyId),
  );
}

describe("the owner's `Movimientos` tab", () => {
  test("lists the academy's payments and refunds newest first, and the balance subtracts the refunds", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const otherEvent = await createSavedEvent({
      active: false,
      requiredDepositPercentage: 30,
    });
    // Two payments dated 04-01 and 04-02, 1500 of them funded.
    const { academyId } = await seedOwnerPoolForTest({
      academyName: "Academia Movimientos",
      event,
      fundedAmount: 1500,
      paymentAmounts: [2000, 1000],
    });
    await registerRefundForTest({
      academyId,
      amount: 600,
      eventId: event.id,
      refundDate: "2026-04-03",
    });
    await registerRefundForTest({
      academyId,
      amount: 400,
      eventId: event.id,
      refundDate: "2026-04-01",
    });
    await registerPaymentForTest({
      academyId,
      amount: "9000",
      eventId: otherEvent.id,
      paymentDate: "2026-04-05",
    });

    const loaderData = await loadOwnerPage(academyId, event.id);

    expect(
      loaderData.movements.map((movement) => [
        movement.kind,
        movement.number,
        movement.date,
        movement.amount,
      ]),
    ).toEqual([
      ["refund", 1, "2026-04-03", 600],
      ["payment", 2, "2026-04-02", 1000],
      // Same day: the refund was recorded after the payment.
      ["refund", 2, "2026-04-01", 400],
      ["payment", 1, "2026-04-01", 2000],
    ]);
    expect(loaderData.summary.availableBalanceAmount).toBe(500);
  });

  test("lists an individual's movements the same way", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const individual = await createIndividualUser({
      email: `${crypto.randomUUID()}@example.com`,
    });
    await registerPaymentForTest({
      academyId: individual.ownerId,
      amount: "5000",
      eventId: event.id,
      paymentDate: "2026-04-02",
    });
    await registerRefundForTest({
      academyId: individual.ownerId,
      amount: 5000,
      eventId: event.id,
      refundDate: "2026-04-04",
    });

    const loaderData = await loadOwnerPage(individual.ownerId, event.id);

    expect(
      loaderData.movements.map((movement) => [movement.kind, movement.amount]),
    ).toEqual([
      ["refund", 5000],
      ["payment", 5000],
    ]);
    expect(loaderData.summary.availableBalanceAmount).toBe(0);
  });
});

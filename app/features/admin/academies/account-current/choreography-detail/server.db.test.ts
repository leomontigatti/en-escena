import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  academyEventPayments,
  choreographyDancers,
  paymentAllocations,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import * as businessTimeZone from "@/lib/shared/business-time-zone";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";
import {
  createAccountCurrentChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
} from "../../../../../lib/admin/academies/account-current-route.test-support";

import { loadAdministrativeChoreographyFinanceDetail } from "./server";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedPayment(input: {
  academyId: string;
  amount: number;
  createdByUserId: string;
  eventId: string;
  paymentNumber: number;
}) {
  const [payment] = await db
    .insert(academyEventPayments)
    .values({
      academyId: input.academyId,
      amount: input.amount,
      createdByUserId: input.createdByUserId,
      eventId: input.eventId,
      paymentDate: "2026-03-21",
      paymentMethod: "transferencia",
      paymentNumber: input.paymentNumber,
    })
    .returning();

  return payment;
}

describe.sequential("administracion finanzas coreografia detalle", () => {
  test("derives impaga state and tentative amounts from an inscription without snapshots", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-03-27",
    );

    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Impaga",
        email: "academia.impaga.detalle@example.com",
        choreographyName: "Detalle impaga",
        event,
      });
    const dancer = await createDancer(academy.academy.id, {
      firstName: "Ana",
      lastName: "López",
    });

    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    });

    const { request } = await createSignedInRequest({
      email: "admin.impaga.detalle@example.com",
      role: "admin",
      requestUrl: choreographyFinanceDetailUrl({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        eventId: event.id,
      }),
    });

    const loaderData = await loadAdministrativeChoreographyFinanceDetail(
      detailRouteArgs({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        request,
      }),
    );

    expect(loaderData.choreography).toMatchObject({
      depositAmount: { amount: 3000, status: "complete" },
      depositCompletedOn: null,
      financialState: "impaga",
      needsAttention: false,
      owedAmount: { amount: 3000, status: "complete" },
      paidAmount: 0,
    });
    expect(loaderData.inscriptions).toEqual([
      {
        basePriceAmount: 10000,
        balanceAmount: 0,
        dancerId: dancer.id,
        depositAmount: 3000,
        discountAmount: 0,
        finalPriceAmount: 10000,
        firstName: "Ana",
        lastName: "López",
        state: "impaga",
      },
    ]);
  });

  test("derives señada state and pending saldo from a deposit snapshot and allocation", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Señada",
        email: "academia.senada.detalle@example.com",
        choreographyName: "Detalle señada",
        event,
      });
    const dancer = await createDancer(academy.academy.id, {
      firstName: "Luna",
      lastName: "García",
    });

    const [inscription] = await db
      .insert(choreographyDancers)
      .values({
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancer.id,
        frozenBasePriceAmount: 10000,
        depositReferenceDate: "2026-03-21",
        depositPercentage: 30,
        depositAmount: 3000,
      })
      .returning();
    const payment = await seedPayment({
      academyId: academy.academy.id,
      amount: 3000,
      createdByUserId: academy.user.id,
      eventId: event.id,
      paymentNumber: 1,
    });
    await db.insert(paymentAllocations).values({
      academyId: academy.academy.id,
      allocationType: "deposit",
      amount: 3000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    const { request } = await createSignedInRequest({
      email: "admin.senada.detalle@example.com",
      role: "admin",
      requestUrl: choreographyFinanceDetailUrl({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        eventId: event.id,
      }),
    });

    const loaderData = await loadAdministrativeChoreographyFinanceDetail(
      detailRouteArgs({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        request,
      }),
    );

    expect(loaderData.choreography).toMatchObject({
      depositAmount: { amount: 3000, status: "complete" },
      depositCompletedOn: "2026-03-21",
      financialState: "señada",
      needsAttention: false,
      owedAmount: { amount: 7000, status: "complete" },
      paidAmount: 3000,
    });
    expect(loaderData.inscriptions).toEqual([
      {
        basePriceAmount: 10000,
        balanceAmount: 7000,
        dancerId: dancer.id,
        depositAmount: 3000,
        discountAmount: 0,
        finalPriceAmount: 10000,
        firstName: "Luna",
        lastName: "García",
        state: "señada",
      },
    ]);
  });

  test("derives pagada state and zero saldo from a balance snapshot", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Pagada",
        email: "academia.pagada.detalle@example.com",
        choreographyName: "Detalle pagada",
        event,
      });
    const dancer = await createDancer(academy.academy.id, {
      firstName: "Mora",
      lastName: "Ruiz",
    });

    const [inscription] = await db
      .insert(choreographyDancers)
      .values({
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancer.id,
        frozenBasePriceAmount: 10000,
        depositReferenceDate: "2026-03-21",
        depositPercentage: 30,
        depositAmount: 3000,
        balanceReferenceDate: "2026-04-21",
        appliedDancerDiscountPercentage: 0,
        appliedDancerDiscountAmount: 0,
        finalTotalAmount: 10000,
        balanceAmount: 7000,
        balanceCompletedAt: "2026-04-21",
      })
      .returning();
    const payment = await seedPayment({
      academyId: academy.academy.id,
      amount: 10000,
      createdByUserId: academy.user.id,
      eventId: event.id,
      paymentNumber: 1,
    });
    await db.insert(paymentAllocations).values([
      {
        academyId: academy.academy.id,
        allocationType: "deposit",
        amount: 3000,
        eventId: event.id,
        inscriptionId: inscription.id,
        paymentId: payment.id,
      },
      {
        academyId: academy.academy.id,
        allocationType: "balance",
        amount: 7000,
        eventId: event.id,
        inscriptionId: inscription.id,
        paymentId: payment.id,
      },
    ]);

    const { request } = await createSignedInRequest({
      email: "admin.pagada.detalle@example.com",
      role: "admin",
      requestUrl: choreographyFinanceDetailUrl({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        eventId: event.id,
      }),
    });

    const loaderData = await loadAdministrativeChoreographyFinanceDetail(
      detailRouteArgs({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        request,
      }),
    );

    expect(loaderData.choreography).toMatchObject({
      financialState: "pagada",
      owedAmount: { amount: 0, status: "complete" },
      paidAmount: 10000,
    });
  });

  test("shows incomplete amounts and Sin precio when no applicable price exists", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-01",
    );

    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Sin Precio",
        email: "academia.sin.precio.detalle@example.com",
        choreographyName: "Detalle sin precio",
        event,
      });
    const dancer = await createDancer(academy.academy.id, {
      firstName: "Mora",
      lastName: "Pérez",
    });

    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    });

    const { request } = await createSignedInRequest({
      email: "admin.sin.precio.detalle@example.com",
      role: "admin",
      requestUrl: choreographyFinanceDetailUrl({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        eventId: event.id,
      }),
    });

    const loaderData = await loadAdministrativeChoreographyFinanceDetail(
      detailRouteArgs({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        request,
      }),
    );

    expect(loaderData.choreography).toMatchObject({
      depositAmount: {
        amount: 0,
        missingPriceCount: 1,
        status: "incomplete",
      },
      owedAmount: {
        amount: 0,
        missingPriceCount: 1,
        status: "incomplete",
      },
    });
    expect(loaderData.inscriptions).toEqual([
      {
        basePriceAmount: null,
        balanceAmount: 0,
        dancerId: dancer.id,
        depositAmount: null,
        discountAmount: 0,
        finalPriceAmount: null,
        firstName: "Mora",
        lastName: "Pérez",
        state: "impaga",
      },
    ]);
  });
});

function choreographyFinanceDetailUrl(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}) {
  return `http://localhost/administracion/finanzas/${input.academyId}/coreografias/${input.choreographyId}?evento=${input.eventId}`;
}

function detailRouteArgs(input: {
  academyId: string;
  choreographyId: string;
  request: Request;
}) {
  return {
    context: {},
    params: {
      academyId: input.academyId,
      choreographyId: input.choreographyId,
    },
    pattern: "/administracion/finanzas/:academyId/coreografias/:choreographyId",
    request: input.request,
    url: new URL(input.request.url),
  };
}

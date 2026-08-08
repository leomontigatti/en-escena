import { afterEach, describe, expect, test, vi } from "vitest";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  payments,
  choreographyDancers,
  paymentAllocations,
  prices,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import * as businessTimeZone from "@/lib/shared/business-time-zone";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
} from "../../../../../lib/admin/finances/finances.test-support";

import { loadChoreographyFinanceDetail } from "./server";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedPayment(input: {
  academyId: string;
  amount: number;
  eventId: string;
  paymentDate?: string;
  paymentNumber: number;
}) {
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: input.academyId,
      amount: input.amount,
      eventId: input.eventId,
      paymentDate: input.paymentDate ?? "2026-03-21",
      paymentMethod: "transferencia",
      paymentNumber: input.paymentNumber,
    })
    .returning();

  return payment;
}

/**
 * Fila de precio `solo` del catálogo del evento. Las inscripciones ya cobradas
 * la llevan en `selectedPriceId`, que es lo que el cobro escribe y de donde
 * salen la seña y el total.
 */
async function readSoloPriceId(eventId: string) {
  const [price] = await db
    .select({ id: prices.id })
    .from(prices)
    .where(and(eq(prices.eventId, eventId), eq(prices.groupType, "solo")));

  return price.id;
}

/**
 * Entra al detalle como admin y devuelve lo que ve el loader.
 */
async function loadDetailAsAdmin(input: {
  academyId: string;
  choreographyId: string;
  email: string;
  eventId: string;
}) {
  const { request } = await createSignedInRequest({
    email: input.email,
    role: "admin",
    requestUrl: choreographyFinanceDetailUrl({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      eventId: input.eventId,
    }),
  });

  return await loadChoreographyFinanceDetail(
    detailRouteArgs({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      request,
    }),
  );
}

describe.sequential("administracion finanzas coreografia detalle", () => {
  test("derives deposit pending and both shortfalls from an inscription holding nothing", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-03-27",
    );

    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAcademyFinanceChoreographyFixture({
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

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.impaga.detalle@example.com",
      eventId: event.id,
    });

    expect(loaderData.choreography).toMatchObject({
      allocatedAmount: 0,
      depositAmount: { amount: 3000, status: "complete" },
      financialStatus: "depositPending",
      // Una coreografía registrada se adeuda completa desde el minuto cero.
      owedBalanceAmount: { amount: 10000, status: "complete" },
      owedDepositAmount: { amount: 3000, status: "complete" },
      totalAmount: { amount: 10000, status: "complete" },
    });
    expect(loaderData.inscriptions).toEqual([
      {
        allocatedAmount: 0,
        anomalies: [],
        basePriceAmount: 10000,
        dancerId: dancer.id,
        depositAmount: 3000,
        discountAmount: 0,
        financialStatus: "depositPending",
        firstName: "Ana",
        inscriptionId: expect.any(String),
        lastName: "López",
        overAllocatedAmount: 0,
        owedBalanceAmount: 10000,
        owedDepositAmount: 3000,
        selectedPrice: null,
        totalAmount: 10000,
        withdrawn: false,
      },
    ]);
  });

  test("derives deposit met and the remaining shortfall once the seña is covered", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAcademyFinanceChoreographyFixture({
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
        selectedPriceId: await readSoloPriceId(event.id),
        depositReferenceDate: "2026-03-21",
        depositPercentage: 30,
        depositAmount: 3000,
      })
      .returning();
    const payment = await seedPayment({
      academyId: academy.academy.id,
      amount: 3000,
      eventId: event.id,
      paymentNumber: 1,
    });
    await db.insert(paymentAllocations).values({
      academyId: academy.academy.id,
      amount: 3000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.senada.detalle@example.com",
      eventId: event.id,
    });

    expect(loaderData.choreography).toMatchObject({
      allocatedAmount: 3000,
      depositAmount: { amount: 3000, status: "complete" },
      financialStatus: "depositMet",
      owedBalanceAmount: { amount: 7000, status: "complete" },
      owedDepositAmount: { amount: 0, status: "complete" },
      totalAmount: { amount: 10000, status: "complete" },
    });
    expect(loaderData.inscriptions).toEqual([
      {
        allocatedAmount: 3000,
        anomalies: [],
        basePriceAmount: 10000,
        dancerId: dancer.id,
        depositAmount: 3000,
        discountAmount: 0,
        financialStatus: "depositMet",
        firstName: "Luna",
        inscriptionId: expect.any(String),
        lastName: "García",
        overAllocatedAmount: 0,
        owedBalanceAmount: 7000,
        owedDepositAmount: 0,
        selectedPrice: {
          amount: 10000,
          id: expect.any(String),
          name: "Precio Solo",
        },
        totalAmount: 10000,
        withdrawn: false,
      },
    ]);
  });

  test("derives paid in full once the allocation reaches the total", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAcademyFinanceChoreographyFixture({
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
        selectedPriceId: await readSoloPriceId(event.id),
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
      eventId: event.id,
      paymentNumber: 1,
    });
    // Una sola fila por (pago, inscripción): la seña y el saldo cobrados con el
    // mismo pago son una asignación de 10000.
    await db.insert(paymentAllocations).values({
      academyId: academy.academy.id,
      amount: 10000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.pagada.detalle@example.com",
      eventId: event.id,
    });

    expect(loaderData.choreography).toMatchObject({
      allocatedAmount: 10000,
      financialStatus: "paidInFull",
      // El total se sigue mostrando aunque ya no se adeude nada de él.
      owedBalanceAmount: { amount: 0, status: "complete" },
      totalAmount: { amount: 10000, status: "complete" },
    });
    // The price the row already holds travels with it: the dialog shows it
    // locked, because the money has already fixed it.
    expect(loaderData.inscriptions[0]?.selectedPrice).toMatchObject({
      amount: 10000,
    });
  });

  test("keeps a withdrawn inscription visible, with its retained allocation as its total", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAcademyFinanceChoreographyFixture({
        academyName: "Academia Retirada",
        email: "academia.retirada.detalle@example.com",
        choreographyName: "Detalle retirada",
        event,
      });
    const priceId = await readSoloPriceId(event.id);
    const [staying, withdrawn] = await Promise.all([
      createDancer(academy.academy.id, { firstName: "Sol", lastName: "Queda" }),
      createDancer(academy.academy.id, {
        firstName: "Ivo",
        lastName: "Retirado",
      }),
    ]);
    const inscriptions = await db
      .insert(choreographyDancers)
      .values([
        {
          ageAtEventStart: 14,
          choreographyId: choreography.id,
          dancerId: staying.id,
          selectedPriceId: priceId,
        },
        {
          ageAtEventStart: 14,
          choreographyId: choreography.id,
          dancerId: withdrawn.id,
          selectedPriceId: priceId,
          withdrawnAt: new Date("2026-04-01T12:00:00Z"),
        },
      ])
      .returning();
    const withdrawnInscription = inscriptions.find(
      (row) => row.dancerId === withdrawn.id,
    )!;
    const payment = await seedPayment({
      academyId: academy.academy.id,
      amount: 3000,
      eventId: event.id,
      paymentNumber: 1,
    });
    // It was withdrawn with the deposit on it: that money was retained, and the
    // row is what documents it.
    await db.insert(paymentAllocations).values({
      academyId: academy.academy.id,
      amount: 3000,
      eventId: event.id,
      inscriptionId: withdrawnInscription.id,
      paymentId: payment.id,
    });

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.retirada.detalle@example.com",
      eventId: event.id,
    });

    const withdrawnRow = loaderData.inscriptions.find(
      (row) => row.dancerId === withdrawn.id,
    );

    expect(withdrawnRow).toMatchObject({
      allocatedAmount: 3000,
      // Its total is what remains allocated, neither zero nor the price.
      totalAmount: 3000,
      // No obligation left outstanding, and `Sobreasignada` cannot fire.
      anomalies: [],
      overAllocatedAmount: 0,
      owedBalanceAmount: 0,
      owedDepositAmount: 0,
      // The deposit stays exposed: it is what the remove-the-balance preset
      // looks at.
      depositAmount: 3000,
      withdrawn: true,
    });
    expect(loaderData.choreography).toMatchObject({
      // The retained money re-enters the choreography's money rollup…
      allocatedAmount: 3000,
      totalAmount: { amount: 13000, status: "complete" },
      // …and the status is decided by the inscription still on the roster alone.
      financialStatus: "depositPending",
      owedBalanceAmount: { amount: 10000, status: "complete" },
      owedDepositAmount: { amount: 3000, status: "complete" },
    });
  });

  test("shows incomplete amounts and Sin precio when no applicable price exists", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-01",
    );

    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAcademyFinanceChoreographyFixture({
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

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.sin.precio.detalle@example.com",
      eventId: event.id,
    });

    // An incomplete deposit figure is the "no price" condition the view blames
    // the missing price for.
    expect(loaderData.choreography).toMatchObject({
      depositAmount: {
        amount: 0,
        missingPriceCount: 1,
        status: "incomplete",
      },
      owedBalanceAmount: {
        amount: 0,
        missingPriceCount: 1,
        status: "incomplete",
      },
      totalAmount: {
        amount: 0,
        missingPriceCount: 1,
        status: "incomplete",
      },
    });
    expect(loaderData.inscriptions).toEqual([
      {
        allocatedAmount: 0,
        anomalies: [],
        basePriceAmount: null,
        dancerId: dancer.id,
        depositAmount: null,
        discountAmount: 0,
        financialStatus: "depositPending",
        firstName: "Mora",
        inscriptionId: expect.any(String),
        lastName: "Pérez",
        overAllocatedAmount: null,
        owedBalanceAmount: null,
        owedDepositAmount: null,
        selectedPrice: null,
        totalAmount: null,
        withdrawn: false,
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

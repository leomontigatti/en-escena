import { afterEach, describe, expect, test, vi } from "vitest";

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
 * Precio anterior al que trae el catálogo (10000, vence el 31/05), para modelar
 * un aumento: hasta el 31/03 rige éste y desde el 01/04 el del catálogo.
 */
async function seedEarlierPrice(input: { amount: number; eventId: string }) {
  await db.insert(prices).values({
    eventId: input.eventId,
    name: "Precio Solo anterior",
    groupType: "solo",
    amount: input.amount,
    paymentDeadline: "2026-03-31",
    scheduleId: null,
  });
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

  return await loadAdministrativeChoreographyFinanceDetail(
    detailRouteArgs({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      request,
    }),
  );
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

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.impaga.detalle@example.com",
      eventId: event.id,
    });

    expect(loaderData.choreography).toMatchObject({
      depositAmount: { amount: 3000, status: "complete" },
      // El saldo tentativo se muestra desde impaga: no es 0, es lo que va a
      // quedar por pagar después de la seña.
      balanceAmount: { amount: 7000, status: "complete" },
      depositCompletedOn: null,
      financialState: "impaga",
      needsAttention: false,
      paidAmount: 0,
    });
    expect(loaderData.inscriptions).toEqual([
      {
        basePriceAmount: 10000,
        balanceAmount: 7000,
        dancerId: dancer.id,
        depositAmount: 3000,
        discountAmount: 0,
        finalPriceAmount: 10000,
        firstName: "Ana",
        inscriptionId: expect.any(String),
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

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.senada.detalle@example.com",
      eventId: event.id,
    });

    expect(loaderData.choreography).toMatchObject({
      depositAmount: { amount: 3000, status: "complete" },
      balanceAmount: { amount: 7000, status: "complete" },
      depositCompletedOn: "2026-03-21",
      financialState: "señada",
      needsAttention: false,
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
        inscriptionId: expect.any(String),
        lastName: "García",
        state: "señada",
      },
    ]);
  });

  test("derives pagada state and a frozen saldo from a balance snapshot", async () => {
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

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.pagada.detalle@example.com",
      eventId: event.id,
    });

    expect(loaderData.choreography).toMatchObject({
      financialState: "pagada",
      // El saldo congelado se sigue mostrando aunque ya esté pagado.
      balanceAmount: { amount: 7000, status: "complete" },
      paidAmount: 10000,
    });
  });

  test("quotes the deposit against the payment date, not against today", async () => {
    // El precio ya aumentó: hoy la seña sale 3000, pero al 21/03 salía 2400.
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-04-15",
    );

    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Precio Histórico",
        email: "academia.precio.historico@example.com",
        choreographyName: "Detalle precio histórico",
        event,
      });
    await seedEarlierPrice({ amount: 8000, eventId: event.id });

    const dancer = await createDancer(academy.academy.id, {
      firstName: "Sol",
      lastName: "Ramos",
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    });

    // Registrado hoy con fecha anterior, por el precio que se le mantuvo a la
    // academia. Cubre la seña del 21/03 (2400) pero no la de hoy (3000).
    const payment = await seedPayment({
      academyId: academy.academy.id,
      amount: 2400,
      eventId: event.id,
      paymentDate: "2026-03-21",
      paymentNumber: 1,
    });

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.precio.historico@example.com",
      eventId: event.id,
    });

    expect(loaderData.stage).toBe("deposit");
    // La coreografía sigue mostrando el precio vigente hoy...
    expect(loaderData.choreography).toMatchObject({
      depositAmount: { amount: 3000, status: "complete" },
    });
    // ...pero el pago se cotiza contra su propia fecha, así que alcanza.
    expect(loaderData.payments).toEqual([
      expect.objectContaining({ id: payment.id, stageTotalAmount: 2400 }),
    ]);
  });

  test("quotes the deposit above today's when the payment date resolves to a dearer price", async () => {
    // Espejo del caso anterior: al 21/03 la seña salía 3600 y hoy sale 3000. El
    // pago no alcanza, y ofrecerlo terminaría en un rechazo del cobro.
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-04-15",
    );

    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Precio Bajado",
        email: "academia.precio.bajado@example.com",
        choreographyName: "Detalle precio bajado",
        event,
      });
    await seedEarlierPrice({ amount: 12000, eventId: event.id });

    const dancer = await createDancer(academy.academy.id, {
      firstName: "Nina",
      lastName: "Soto",
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    });

    const payment = await seedPayment({
      academyId: academy.academy.id,
      amount: 3000,
      eventId: event.id,
      paymentDate: "2026-03-21",
      paymentNumber: 1,
    });

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.precio.bajado@example.com",
      eventId: event.id,
    });

    expect(loaderData.payments).toEqual([
      expect.objectContaining({ id: payment.id, stageTotalAmount: 3600 }),
    ]);
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

    const loaderData = await loadDetailAsAdmin({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      email: "admin.sin.precio.detalle@example.com",
      eventId: event.id,
    });

    expect(loaderData.choreography).toMatchObject({
      depositAmount: {
        amount: 0,
        missingPriceCount: 1,
        status: "incomplete",
      },
      balanceAmount: {
        amount: 0,
        missingPriceCount: 1,
        status: "incomplete",
      },
    });
    expect(loaderData.inscriptions).toEqual([
      {
        basePriceAmount: null,
        balanceAmount: null,
        dancerId: dancer.id,
        depositAmount: null,
        discountAmount: 0,
        finalPriceAmount: null,
        firstName: "Mora",
        inscriptionId: expect.any(String),
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

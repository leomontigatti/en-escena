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
 * The `solo` price row of the event's catalogue. Already collected inscriptions
 * carry it in `selectedPriceId`, which is what the collection writes and where
 * the deposit and the total come from.
 */
async function readSoloPriceId(eventId: string) {
  const [price] = await db
    .select({ id: prices.id })
    .from(prices)
    .where(and(eq(prices.eventId, eventId), eq(prices.groupType, "solo")));

  return price.id;
}

/**
 * Enters the detail as an admin and returns what the loader sees.
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

describe.sequential("`/administracion/finanzas` choreography detail", () => {
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
      // A registered choreography is owed in full from minute zero.
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
        // No row is stored yet, and the effective price is the one that applies
        // today: it is what the figures come from and what the dialog reads out.
        effectivePrice: {
          amount: 10000,
          id: expect.any(String),
          name: "Precio Solo",
        },
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

  test("derives deposit met and the remaining shortfall once the threshold is covered", async () => {
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
        selectedPriceId: await readSoloPriceId(event.id),
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
        effectivePrice: {
          amount: 10000,
          id: expect.any(String),
          name: "Precio Solo",
        },
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
        selectedPriceId: await readSoloPriceId(event.id),
      })
      .returning();
    const payment = await seedPayment({
      academyId: academy.academy.id,
      amount: 10000,
      eventId: event.id,
      paymentNumber: 1,
    });
    // A single row per (payment, inscription): the deposit and the balance
    // collected with the same payment are one allocation of 10000.
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
      // The total is still shown even though none of it is owed any more.
      owedBalanceAmount: { amount: 0, status: "complete" },
      totalAmount: { amount: 10000, status: "complete" },
    });
    // The price the row already holds travels with it: the dialog shows it
    // locked, because the money has already fixed it. Above the threshold the
    // effective price is that same stored row.
    expect(loaderData.inscriptions[0]?.selectedPrice).toMatchObject({
      amount: 10000,
    });
    expect(loaderData.inscriptions[0]?.effectivePrice).toMatchObject({
      amount: 10000,
    });
  });

  test("reads the dialog out at the effective price below the deposit, not at the stored one", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-04-10",
    );

    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const { academy, choreography } =
      await createAcademyFinanceChoreographyFixture({
        academyName: "Academia Bajo Seña",
        email: "academia.bajo.senia.detalle@example.com",
        choreographyName: "Detalle bajo seña",
        event,
      });
    const dancer = await createDancer(academy.academy.id, {
      firstName: "Nina",
      lastName: "Costa",
    });
    // A dearer row with a later deadline: stored without ever being the one
    // that applies today, so the two prices are told apart by their amount.
    const [storedPrice] = await db
      .insert(prices)
      .values({
        amount: 12000,
        eventId: event.id,
        groupType: "solo",
        name: "Precio Solo posterior",
        paymentDeadline: "2026-06-30",
        scheduleId: null,
      })
      .returning();
    const [inscription] = await db
      .insert(choreographyDancers)
      .values({
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancer.id,
        selectedPriceId: storedPrice.id,
      })
      .returning();
    const payment = await seedPayment({
      academyId: academy.academy.id,
      amount: 3000,
      eventId: event.id,
      paymentNumber: 1,
    });
    // 3000 is 600 short of the stored row's 3600 deposit, so the price is still
    // loose and the read follows the list.
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
      email: "admin.bajo.senia.detalle@example.com",
      eventId: event.id,
    });

    // The figure the dialog reads out is the one the row behind it shows.
    // Showing the stored row here would put 12000 inside the dialog and 10000
    // on the row, on the same inscription and the same screen.
    const row = loaderData.inscriptions[0];
    expect(row?.effectivePrice).toMatchObject({
      amount: 10000,
      name: "Precio Solo",
    });
    expect(row?.basePriceAmount).toBe(10000);
    // The stored row travels too, and it is the picker's default — the one
    // thing that still reads what the administrator last said.
    expect(row?.selectedPrice).toMatchObject({ amount: 12000 });
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

  test("shows incomplete amounts and `Sin precio` when no applicable price exists", async () => {
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
        effectivePrice: null,
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

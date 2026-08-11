import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  payments as paymentTable,
  choreographyDancers,
  paymentAllocations,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  date as choreographyDate,
} from "@/features/portal/choreographies/test-support/db";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { loader as academiesLoader } from "@/routes/administracion.academias";
import { loader as financeAccountsLoader } from "@/routes/administracion.finanzas";
import {
  action as paymentCreateAction,
  loader as paymentCreateLoader,
} from "@/routes/administracion.pagos_.nuevo";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  academiesRouteArgs,
  renderAcademiesRoute,
} from "../academies/academies-route.test-support";
import {
  buildGlobalPaymentRequest,
  createAcademyUser,
  createInactiveEvent,
  createSavedEvent,
  createSignedInRequest,
  financesListRouteArgs,
  financesListUrl,
  renderFinanceAccountsRoute,
  paymentCreateRouteArgs,
} from "./finances.test-support";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedPaymentRecord(input: {
  academyId: string;
  amount: number;
  eventId: string;
  paymentDate: string;
  paymentNumber: number;
}) {
  const [payment] = await db
    .insert(paymentTable)
    .values({
      academyId: input.academyId,
      amount: input.amount,
      eventId: input.eventId,
      paymentDate: input.paymentDate,
      paymentMethod: "transferencia",
      paymentNumber: input.paymentNumber,
    })
    .returning();

  return payment;
}

async function seedSignedInscription(input: {
  academyId: string;
  choreographyId: string;
  dancerId: string;
}) {
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: input.choreographyId,
      dancerId: input.dancerId,
    })
    .returning();

  return inscription;
}

describe.sequential("administracion finanzas", () => {
  test("lets admin open finance accounts from academies and renders event-scoped balances", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-03-27",
    );

    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const otherEvent = await createInactiveEvent("En Escena 2027");
    const academyNorth = await createAcademyUser({
      email: "academia.reporte.norte@example.com",
      academyName: "Academia Norte",
    });
    const academySouth = await createAcademyUser({
      email: "academia.reporte.sur@example.com",
      academyName: "Academia Sur",
    });
    const academyGhost = await createAcademyUser({
      email: "academia.reporte.fantasma@example.com",
      academyName: "Academia Fantasma",
    });
    const eventCatalog = await createEventCatalog(event.id);
    const otherEventCatalog = await createEventCatalog(otherEvent.id);

    async function createNorthChoreography(name: string, createdAt: string) {
      return await createChoreographyRecord({
        academyId: academyNorth.academy.id,
        categoryId: eventCatalog.categoryWithLevel.id,
        createdAt: choreographyDate(createdAt),
        eventId: event.id,
        experienceLevelId: eventCatalog.level.id,
        modalityId: eventCatalog.modality.id,
        name,
        scheduleCapacityId: eventCatalog.scheduleCapacity.id,
        submodalityId: eventCatalog.submodality.id,
      });
    }

    const northActive = await createNorthChoreography(
      "Norte Activa",
      "2026-03-10T12:00:00Z",
    );
    const northSecond = await createNorthChoreography(
      "Norte Segunda",
      "2026-03-12T12:00:00Z",
    );
    const northPaid = await createNorthChoreography(
      "Norte Pagada",
      "2026-03-13T12:00:00Z",
    );
    const southChoreography = await createChoreographyRecord({
      academyId: academySouth.academy.id,
      categoryId: eventCatalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-11T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: eventCatalog.level.id,
      modalityId: eventCatalog.modality.id,
      name: "Sur Activa",
      scheduleCapacityId: eventCatalog.scheduleCapacity.id,
      submodalityId: eventCatalog.submodality.id,
    });

    // Ghost academy only participates in the inactive event.
    await createChoreographyRecord({
      academyId: academyGhost.academy.id,
      categoryId: otherEventCatalog.categoryWithLevel.id,
      createdAt: choreographyDate("2027-03-10T12:00:00Z"),
      eventId: otherEvent.id,
      experienceLevelId: otherEventCatalog.level.id,
      modalityId: otherEventCatalog.modality.id,
      name: "Fantasma",
      scheduleCapacityId: otherEventCatalog.scheduleCapacity.id,
      submodalityId: otherEventCatalog.submodality.id,
    });

    const northPayment = await seedPaymentRecord({
      academyId: academyNorth.academy.id,
      amount: 20000,
      eventId: event.id,
      paymentDate: "2026-03-15",
      paymentNumber: 1,
    });
    // A payment on the inactive event must not leak into active-event balances.
    await seedPaymentRecord({
      academyId: academyNorth.academy.id,
      amount: 3333,
      eventId: otherEvent.id,
      paymentDate: "2026-03-14",
      paymentNumber: 1,
    });
    await seedPaymentRecord({
      academyId: academySouth.academy.id,
      amount: 3000,
      eventId: event.id,
      paymentDate: "2026-03-16",
      paymentNumber: 2,
    });

    // Norte Activa: señada with a deposit allocation -> pending saldo 7000.
    const northActiveDancer = await createDancer(academyNorth.academy.id, {
      firstName: "Ana",
      lastName: "Activa",
    });
    const northActiveInscription = await seedSignedInscription({
      academyId: academyNorth.academy.id,
      choreographyId: northActive.id,
      dancerId: northActiveDancer.id,
    });
    await db.insert(paymentAllocations).values({
      academyId: academyNorth.academy.id,
      amount: 3000,
      eventId: event.id,
      inscriptionId: northActiveInscription.id,
      paymentId: northPayment.id,
    });

    // Norte Segunda: impaga -> pending seña 3000 at the tentative price.
    const northSecondDancer = await createDancer(academyNorth.academy.id, {
      firstName: "Bruno",
      lastName: "Segundo",
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: northSecond.id,
      dancerId: northSecondDancer.id,
    });

    // Norte Pagada: pagada, con la seña y el saldo en una sola asignación.
    const northPaidDancer = await createDancer(academyNorth.academy.id, {
      firstName: "Carla",
      lastName: "Pagada",
    });
    const northPaidInscription = await seedSignedInscription({
      academyId: academyNorth.academy.id,
      choreographyId: northPaid.id,
      dancerId: northPaidDancer.id,
    });
    await db.insert(paymentAllocations).values({
      academyId: academyNorth.academy.id,
      amount: 10000,
      eventId: event.id,
      inscriptionId: northPaidInscription.id,
      paymentId: northPayment.id,
    });

    // Sur Activa: impaga -> pending seña 3000, no allocations.
    const southDancer = await createDancer(academySouth.academy.id, {
      firstName: "Delia",
      lastName: "Sur",
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: southChoreography.id,
      dancerId: southDancer.id,
    });

    const { request: listRequest } = await createSignedInRequest({
      email: "admin.reporte.lista@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/academias?evento=${event.id}`,
    });
    const academiesLoaderData = await academiesLoader(
      academiesRouteArgs(listRequest),
    );
    const academiesMarkup = renderAcademiesRoute({
      loaderData: academiesLoaderData,
    });

    expect(academiesMarkup).not.toContain('aria-label="Acciones"');

    const { request: financesRequest } = await createSignedInRequest({
      email: "admin.reporte@example.com",
      role: "admin",
      requestUrl: financesListUrl(event.id),
    });

    const loaderData = await financeAccountsLoader(
      financesListRouteArgs(financesRequest),
    );
    const markup = renderFinanceAccountsRoute({
      loaderData,
    });

    expect(loaderData.selectedEventId).toBe(event.id);
    // Norte: tres inscripciones de 10000 con seña 3000 cada una → seña 9000 y
    // total 30000, la pagada incluida: los umbrales son contexto, no deuda.
    // Pagos 20000 - asignaciones 13000 = disponible 7000; saldo adeudado 17000
    // = 7000 de la que cubrió la seña + 10000 de la que no tiene nada.
    // Sur: una sola inscripción → seña 3000 y total 10000; pagos 3000 -
    // asignaciones 0 = disponible 3000; saldo adeudado 10000.
    expect(loaderData.rows).toEqual([
      {
        academyId: academyNorth.academy.id,
        academyName: "Academia Norte",
        availableBalanceAmount: 7000,
        depositAmount: { status: "complete", amount: 9000 },
        totalAmount: { status: "complete", amount: 30000 },
        owedBalanceAmount: { status: "complete", amount: 17000 },
      },
      {
        academyId: academySouth.academy.id,
        academyName: "Academia Sur",
        availableBalanceAmount: 3000,
        depositAmount: { status: "complete", amount: 3000 },
        totalAmount: { status: "complete", amount: 10000 },
        owedBalanceAmount: { status: "complete", amount: 10000 },
      },
    ]);
    expect(markup).toContain("Finanzas");
    expect(markup).toContain(
      `/administracion/finanzas/${academyNorth.academy.id}`,
    );
    expect(markup).toContain("Seña");
    expect(markup).toContain("Total");
    expect(markup).toContain("Saldo adeudado");
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain("$ 7.000");
    expect(markup).toContain("$ 3.000");
    expect(markup).not.toContain("Academia Fantasma");
    expect(markup).not.toContain("$ 3.333");
  });

  test("marks operational amounts as pending when an applicable price is missing", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const academy = await createAcademyUser({
      email: "academia.precio.pendiente@example.com",
      academyName: "Academia Sin Precio",
    });
    const eventCatalog = await createEventCatalog(event.id);
    const duoChoreography = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: eventCatalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-10T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: eventCatalog.level.id,
      groupType: "duo",
      modalityId: eventCatalog.modality.id,
      name: "Duo sin precio",
      scheduleCapacityId: eventCatalog.scheduleCapacity.id,
      submodalityId: eventCatalog.submodality.id,
    });
    // An impaga inscription with no applicable duo price yields pending amounts.
    const duoDancer = await createDancer(academy.academy.id, {
      firstName: "Sol",
      lastName: "Duo",
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: duoChoreography.id,
      dancerId: duoDancer.id,
    });

    const { request } = await createSignedInRequest({
      email: "admin.precio.pendiente@example.com",
      role: "admin",
      requestUrl: financesListUrl(event.id),
    });

    const loaderData = await financeAccountsLoader(
      financesListRouteArgs(request),
    );
    const markup = renderFinanceAccountsRoute({
      loaderData,
    });

    expect(loaderData.rows).toEqual([
      {
        academyId: academy.academy.id,
        academyName: "Academia Sin Precio",
        availableBalanceAmount: 0,
        // Sin precio aplicable no hay umbral: ni la seña ni el total ni el
        // saldo adeudado de la impaga se pueden cuantificar.
        depositAmount: {
          status: "incomplete",
          amount: 0,
          missingPriceCount: 1,
        },
        totalAmount: {
          status: "incomplete",
          amount: 0,
          missingPriceCount: 1,
        },
        owedBalanceAmount: {
          status: "incomplete",
          amount: 0,
          missingPriceCount: 1,
        },
      },
    ]);
    expect(markup.match(/Pendiente/g)).toHaveLength(3);
  });

  test("lets admin create a payment from the payments form", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.pago.global@example.com",
      academyName: "Academia Pago Global",
    });
    const createUrl = `http://localhost/administracion/pagos/nuevo?evento=${event.id}`;
    const { request: loaderRequest } = await createSignedInRequest({
      email: "admin.pago.global@example.com",
      role: "admin",
      requestUrl: createUrl,
    });

    const loaderData = await paymentCreateLoader(
      paymentCreateRouteArgs(loaderRequest),
    );

    expect(loaderData.selectedEventId).toBe(event.id);
    expect(loaderData.academies).toEqual([
      expect.objectContaining({
        id: academy.academy.id,
        name: "Academia Pago Global",
      }),
    ]);

    const { request: invalidRequest } = await buildGlobalPaymentRequest({
      academyId: "",
      amount: "0",
      paymentDate: "2026-04-10",
      paymentMethod: "transferencia",
      requestUrl: createUrl,
      role: "admin",
    });
    const invalidResult = await paymentCreateAction(
      paymentCreateRouteArgs(invalidRequest),
    );

    expect(invalidResult).toMatchObject({
      status: "error",
      fieldErrors: {
        academyId: "Seleccioná una academia.",
        amount: "Ingresá un monto mayor a cero.",
      },
    });

    const { request: createRequest } = await buildGlobalPaymentRequest({
      academyId: academy.academy.id,
      amount: "12500",
      internalNote: "Pago cargado desde pagos",
      paymentDate: "2026-04-10",
      paymentMethod: "transferencia",
      reference: "TRX-GLOBAL",
      requestUrl: createUrl,
      role: "admin",
    });

    await expect(
      paymentCreateAction(paymentCreateRouteArgs(createRequest)),
    ).rejects.toMatchObject({
      status: 302,
    });

    const payments = await db.query.payments.findMany({
      where: eq(paymentTable.academyId, academy.academy.id),
    });

    expect(payments).toEqual([
      expect.objectContaining({
        amount: 12500,
        eventId: event.id,
        internalNote: "Pago cargado desde pagos",
        paymentDate: "2026-04-10",
        paymentMethod: "transferencia",
        paymentNumber: 1,
        reference: "TRX-GLOBAL",
      }),
    ]);
  });

  test("shows the blocked state when there is no active event", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.reporte.sin.evento@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/finanzas",
    });

    const loaderData = await financeAccountsLoader(
      financesListRouteArgs(request),
    );
    const markup = renderFinanceAccountsRoute({
      loaderData,
    });

    expect(loaderData.selectedEventId).toBeNull();
    expect(markup).toContain("No hay un evento activo para operar finanzas");
  });

  test("allows auditor access and blocks academy users", async () => {
    const event = await createSavedEvent();
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.reporte.finanzas@example.com",
      role: "auditor",
      requestUrl: financesListUrl(event.id),
    });

    await expect(
      financeAccountsLoader(financesListRouteArgs(auditorRequest)),
    ).resolves.toMatchObject({
      selectedEventId: event.id,
    });

    const { request: academyRequest } = await createSignedInRequest({
      email: "academia.reporte.bloqueada@example.com",
      role: "academy",
      requestUrl: financesListUrl(event.id),
    });

    await expect(
      financeAccountsLoader(financesListRouteArgs(academyRequest)),
    ).rejects.toMatchObject({
      status: 403,
    });
  });
});

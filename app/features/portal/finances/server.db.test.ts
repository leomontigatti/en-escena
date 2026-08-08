import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  payments,
  choreographyDancers,
  paymentAllocations,
  prices,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  date as choreographyDate,
} from "@/features/portal/choreographies/test-support/db";
import {
  createAcademyRecord,
  createAcademySession,
} from "@/features/portal/test-support/db";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { PortalAcademyFinancesRouteView } from "@/features/portal/finances/view";
import { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import { activateEvent } from "@/lib/events/management.server";
import { loader as academyFinancesLoader } from "@/routes/administracion.finanzas_.$academyId";
import { loader as portalFinanzasLoader } from "@/routes/portal.finanzas";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  academyFinancesUrl,
  createSavedEvent,
  createSignedInRequest,
  academyFinancesRouteArgs,
} from "../../../lib/admin/finances/finances.test-support";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedPayment(input: {
  academyId: string;
  amount: number;
  eventId: string;
  paymentDate: string;
  paymentNumber: number;
  reference?: string;
  internalNote?: string;
}) {
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: input.academyId,
      amount: input.amount,
      eventId: input.eventId,
      internalNote: input.internalNote ?? null,
      paymentDate: input.paymentDate,
      paymentMethod: "transferencia",
      paymentNumber: input.paymentNumber,
      reference: input.reference ?? null,
    })
    .returning();

  return payment;
}

async function seedImpagaInscription(
  choreographyId: string,
  academyId: string,
) {
  const dancer = await createDancer(academyId, {
    firstName: "Ana",
    lastName: choreographyId,
  });

  await db.insert(choreographyDancers).values({
    ageAtEventStart: 14,
    choreographyId,
    dancerId: dancer.id,
  });
}

async function seedSignedInscription(input: {
  academyId: string;
  choreographyId: string;
  depositAmount: number;
  depositReferenceDate?: string;
  frozenBasePriceAmount: number;
  selectedPriceId?: string;
}) {
  const dancer = await createDancer(input.academyId, {
    firstName: "Luna",
    lastName: input.choreographyId,
  });

  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: input.choreographyId,
      dancerId: dancer.id,
      frozenBasePriceAmount: input.frozenBasePriceAmount,
      selectedPriceId: input.selectedPriceId ?? null,
      depositReferenceDate: input.depositReferenceDate ?? "2026-03-20",
      depositPercentage: 30,
      depositAmount: input.depositAmount,
    })
    .returning();

  return inscription;
}

describe.sequential("loadPortalAcademyFinances", () => {
  test("shows only the authenticated academy active-event financial records", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-03-27",
    );

    const owner = await createAcademySession({
      email: "portal.finanzas.owner@example.com",
      academyName: "Academia Portal",
    });
    const otherAcademy = await createAcademyRecord({
      email: "portal.finanzas.other@example.com",
      academyName: "Academia Ajena",
    });
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    await activateEvent(event.id);
    const catalog = await createEventCatalog(event.id);

    const signedChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-10T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Solo Señada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const impagaChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-12T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Solo Impaga",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const otherChoreography = await createChoreographyRecord({
      academyId: otherAcademy.id,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-11T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Ajena",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const activePayment = await seedPayment({
      academyId: owner.academyId,
      amount: 15000,
      eventId: event.id,
      internalNote: "Nota interna admin",
      paymentDate: "2026-03-15",
      paymentNumber: 1,
      reference: "TRX-PORTAL-001",
    });

    await seedPayment({
      academyId: otherAcademy.id,
      amount: 9999,
      eventId: event.id,
      paymentDate: "2026-03-17",
      paymentNumber: 3,
    });

    const signedInscription = await seedSignedInscription({
      academyId: owner.academyId,
      choreographyId: signedChoreography.id,
      depositAmount: 3000,
      frozenBasePriceAmount: 10000,
    });
    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      amount: 3000,
      eventId: event.id,
      inscriptionId: signedInscription.id,
      paymentId: activePayment.id,
    });
    await seedImpagaInscription(impagaChoreography.id, owner.academyId);
    await seedImpagaInscription(otherChoreography.id, otherAcademy.id);

    const loaderData = await loadPortalAcademyFinances(
      new Request("http://localhost/portal/finanzas", {
        headers: { cookie: owner.cookie },
      }),
    );
    const markup = renderFinances(loaderData);

    expect(loaderData.summary).toEqual({
      availableBalanceAmount: 12000,
      // 7000 de faltante en la que cubrió su seña + 10000 de la que no tiene
      // nada. Bruto: los 12000 disponibles no se descuentan acá, se muestran en
      // su propia métrica.
      owedBalanceAmount: { status: "complete", amount: 17000 },
      owedDepositAmount: { status: "complete", amount: 3000 },
      totalPaidAmount: 15000,
    });
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain("Saldo adeudado");
    expect(markup).toContain("Seña adeudada");
    expect(markup).not.toContain("Monto total pagado");
    // Los pagos viven en `/portal/pagos`, no en el resumen.
    expect(markup).not.toContain("Pagos activos");
    expect(markup).not.toContain("TRX-PORTAL-001");
    expect(markup).toContain("Solo Señada");
    expect(markup).not.toContain("Nota interna admin");
    expect(markup).not.toContain("Ajena");
  });

  test("marks portal summary amounts as pending when every current price is expired", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-01",
    );

    const owner = await createAcademySession({
      email: "portal.finanzas.sin.precio@example.com",
      academyName: "Academia Portal Sin Precio",
    });
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    await activateEvent(event.id);
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-10T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Solo vencido",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await seedImpagaInscription(choreography.id, owner.academyId);

    const loaderData = await loadPortalAcademyFinances(
      new Request("http://localhost/portal/finanzas", {
        headers: { cookie: owner.cookie },
      }),
    );
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        undefined,
        createElement(PortalAcademyFinancesRouteView, { loaderData }),
      ),
    );

    expect(loaderData.summary).toMatchObject({
      // La impaga sin precio adeuda seña y saldo, y no se puede cuantificar
      // ninguno de los dos.
      owedBalanceAmount: {
        amount: 0,
        missingPriceCount: 1,
        status: "incomplete",
      },
      owedDepositAmount: {
        amount: 0,
        missingPriceCount: 1,
        status: "incomplete",
      },
    });
    expect(markup).toContain("Pendiente");
  });

  test("matches admin operational summaries once the seña is covered", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-01",
    );

    const owner = await createAcademySession({
      email: "portal.finanzas.snapshot@example.com",
      academyName: "Academia Portal Snapshot",
    });
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    await activateEvent(event.id);
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-10T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Solo Snapshot",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const payment = await seedPayment({
      academyId: owner.academyId,
      amount: 3600,
      eventId: event.id,
      paymentDate: "2026-03-21",
      paymentNumber: 1,
    });
    // Fila de precio vencida al 01/06: la inscripción la tiene seleccionada, y
    // de ahí salen su seña y su total.
    const [selectedPrice] = await db
      .insert(prices)
      .values({
        amount: 12000,
        eventId: event.id,
        groupType: "solo",
        name: "Precio Solo seleccionado",
        paymentDeadline: "2026-03-31",
        scheduleId: null,
      })
      .returning();
    const inscription = await seedSignedInscription({
      academyId: owner.academyId,
      choreographyId: choreography.id,
      depositAmount: 3600,
      depositReferenceDate: "2026-03-21",
      frozenBasePriceAmount: 12000,
      selectedPriceId: selectedPrice.id,
    });
    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      amount: 3600,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: payment.id,
    });

    const portalLoaderData = await loadPortalAcademyFinances(
      new Request("http://localhost/portal/finanzas", {
        headers: { cookie: owner.cookie },
      }),
    );
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.portal.snapshot@example.com",
      role: "admin",
      requestUrl: academyFinancesUrl(owner.academyId, event.id),
    });
    const adminLoaderData = await academyFinancesLoader(
      academyFinancesRouteArgs(adminRequest, owner.academyId),
    );

    expect(portalLoaderData.summary).toEqual({
      availableBalanceAmount: 0,
      owedBalanceAmount: { amount: 8400, status: "complete" },
      owedDepositAmount: { amount: 0, status: "complete" },
      totalPaidAmount: 3600,
    });
    expect(adminLoaderData.summary).toEqual(portalLoaderData.summary);
    expect(adminLoaderData.choreographyFinanceRows).toMatchObject([
      {
        id: choreography.id,
        basePriceAmount: { amount: 12000, status: "complete" },
        depositAmount: { amount: 3600, status: "complete" },
        financialStatus: "depositMet",
        owedBalanceAmount: { amount: 8400, status: "complete" },
        owedDepositAmount: { amount: 0, status: "complete" },
        totalAmount: { amount: 12000, status: "complete" },
      },
    ]);
  });

  test("shows the blocked empty state when there is no active event", async () => {
    const session = await createAcademySession({
      email: "portal.finanzas.sin-evento@example.com",
      academyName: "Academia Sin Evento",
    });

    const loaderData = await portalFinanzasLoader({
      request: new Request("http://localhost/portal/finanzas", {
        headers: { cookie: session.cookie },
      }),
    });
    const markup = renderFinances(loaderData);

    expect(loaderData.activeEvent).toBeNull();
    expect(markup).toContain("Todavía no hay un evento activo");
  });
});

function renderFinances(
  loaderData: Awaited<ReturnType<typeof loadPortalAcademyFinances>>,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/portal/finanzas"] },
      createElement(PortalAcademyFinancesRouteView, {
        loaderData,
      }),
    ),
  );
}

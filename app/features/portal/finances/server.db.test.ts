import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventPayments,
  choreographyDancers,
  prices,
} from "@/db/schema";
import {
  createDancer,
  createChoreographyRecord,
  createEventCatalog,
  date as choreographyDate,
} from "@/features/portal/choreographies/test-support/db";
import { loadAdministrativeChoreographyFinanceDetail } from "@/features/admin/academies/account-current/choreography-detail/server";
import {
  createAcademyRecord,
  createAcademySession,
} from "@/features/portal/test-support/db";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { PortalAcademyFinancesRouteView } from "@/features/portal/finances/view";
import { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import { activateEvent } from "@/lib/events/management.server";
import { action as accountCurrentAction } from "@/routes/administracion.academias_.$academyId";
import { loader as accountCurrentLoader } from "@/routes/administracion.academias_.$academyId";
import { loader as portalFinanzasLoader } from "@/routes/portal.finanzas";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  accountCurrentUrl,
  buildAnnulImputationRequest,
  buildAnnulPaymentRequest,
  buildBalanceInvoiceIssueRequest,
  buildCancelInvoiceRequest,
  buildPaymentImputationRequest,
  completeDepositInvoiceForTest,
  createSavedEvent,
  createSignedInRequest,
  detailActionArgs,
  detailRouteArgs,
  issueDepositInvoiceForTest,
  registerPaymentForTest,
} from "../../../lib/admin/academies/account-current-route.test-support";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

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
    const ownerDepositChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-10T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Dueto Portal",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const ownerBalanceChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-12T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Solo Beca",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const ownerGenericDiscountChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-13T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Solo Descuento",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const cancelledChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-14T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Cancelada",
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

    await registerPaymentForTest({
      academyId: owner.academyId,
      amount: "15000",
      eventId: event.id,
      paymentDate: "2026-03-15",
    });
    await registerPaymentForTest({
      academyId: owner.academyId,
      amount: "6500",
      eventId: event.id,
      paymentDate: "2026-03-16",
    });
    await registerPaymentForTest({
      academyId: otherAcademy.id,
      amount: "9999",
      eventId: event.id,
      paymentDate: "2026-03-17",
    });

    await db
      .update(academyEventPayments)
      .set({
        reference: "TRX-PORTAL-001",
        internalNote: "Nota interna admin",
      })
      .where(eq(academyEventPayments.academyId, owner.academyId));

    await issueDepositInvoiceForTest({
      academyId: owner.academyId,
      choreographyIds: [
        ownerDepositChoreography.id,
        ownerBalanceChoreography.id,
        ownerGenericDiscountChoreography.id,
      ],
      eventId: event.id,
      issueDate: "2026-03-20",
    });
    await issueDepositInvoiceForTest({
      academyId: owner.academyId,
      choreographyIds: [cancelledChoreography.id],
      eventId: event.id,
      issueDate: "2026-03-21",
    });
    await issueDepositInvoiceForTest({
      academyId: otherAcademy.id,
      choreographyIds: [otherChoreography.id],
      eventId: event.id,
      issueDate: "2026-03-20",
    });

    const ownerPayments = await db.query.academyEventPayments.findMany({
      where: (table, { eq }) => eq(table.academyId, owner.academyId),
      orderBy: (table, { asc }) => [asc(table.paymentNumber)],
    });
    const ownerInvoices =
      await db.query.academyEventChoreographyInvoices.findMany({
        where: (table, { eq }) => eq(table.academyId, owner.academyId),
        orderBy: (table, { asc }) => [asc(table.invoiceNumber)],
      });

    const activePayment = ownerPayments[0];
    const annulledPayment = ownerPayments[1];
    const activeDepositInvoices = ownerInvoices.filter(
      (invoice) => invoice.cancelledAt === null,
    );
    const depositInvoice = activeDepositInvoices.find(
      (invoice) => invoice.choreographyId === ownerDepositChoreography.id,
    );
    const balanceSeedInvoice = activeDepositInvoices.find(
      (invoice) => invoice.choreographyId === ownerBalanceChoreography.id,
    );
    const genericDiscountSeedInvoice = activeDepositInvoices.find(
      (invoice) =>
        invoice.choreographyId === ownerGenericDiscountChoreography.id,
    );
    const cancelledInvoice = ownerInvoices.find(
      (invoice) => invoice.choreographyId === cancelledChoreography.id,
    );

    if (
      !activePayment ||
      !annulledPayment ||
      !depositInvoice ||
      !balanceSeedInvoice ||
      !genericDiscountSeedInvoice ||
      !cancelledInvoice
    ) {
      throw new Error("Expected payment and invoice fixtures to exist.");
    }

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildPaymentImputationRequest({
              imputationDate: "2026-03-22",
              invoiceId: depositInvoice.id,
              paymentId: activePayment.id,
              requestUrl: accountCurrentUrl(owner.academyId, event.id),
              role: "admin",
            })
          ).request,
          owner.academyId,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 });

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildPaymentImputationRequest({
              imputationDate: "2026-03-23",
              invoiceId: balanceSeedInvoice.id,
              paymentId: activePayment.id,
              requestUrl: accountCurrentUrl(owner.academyId, event.id),
              role: "admin",
            })
          ).request,
          owner.academyId,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 });

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildPaymentImputationRequest({
              imputationDate: "2026-03-24",
              invoiceId: genericDiscountSeedInvoice.id,
              paymentId: activePayment.id,
              requestUrl: accountCurrentUrl(owner.academyId, event.id),
              role: "admin",
            })
          ).request,
          owner.academyId,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 });

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildBalanceInvoiceIssueRequest({
              administrativeDiscountAmount: "500",
              administrativeDiscountInternalReason: "Beca interna",
              administrativeDiscountPublicLabel: "Beca academia",
              choreographyId: ownerBalanceChoreography.id,
              issueDate: "2026-03-26",
              requestUrl: accountCurrentUrl(owner.academyId, event.id),
              role: "admin",
            })
          ).request,
          owner.academyId,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 });

    const issuedInvoices =
      await db.query.academyEventChoreographyInvoices.findMany({
        where: (table, { eq }) => eq(table.academyId, owner.academyId),
      });
    const balanceInvoice = issuedInvoices.find(
      (invoice) =>
        invoice.invoiceType === "saldo" &&
        invoice.choreographyId === ownerBalanceChoreography.id,
    );

    if (!balanceInvoice) {
      throw new Error("Expected the balance invoice fixture to exist.");
    }

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildPaymentImputationRequest({
              imputationDate: "2026-03-27",
              invoiceId: balanceInvoice.id,
              paymentId: annulledPayment.id,
              requestUrl: accountCurrentUrl(owner.academyId, event.id),
              role: "admin",
            })
          ).request,
          owner.academyId,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 });

    const [annulledImputation] =
      await db.query.academyEventInvoiceImputations.findMany({
        where: (table, { eq }) => eq(table.paymentId, annulledPayment.id),
      });

    if (!annulledImputation) {
      throw new Error("Expected the annulled imputation fixture to exist.");
    }

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildAnnulImputationRequest({
              imputationId: annulledImputation.id,
              reason: "Se imputó en la factura equivocada.",
              requestUrl: accountCurrentUrl(owner.academyId, event.id),
              role: "admin",
            })
          ).request,
          owner.academyId,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 });

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildBalanceInvoiceIssueRequest({
              administrativeDiscountAmount: "200",
              administrativeDiscountInternalReason: "Ajuste interno",
              choreographyId: ownerGenericDiscountChoreography.id,
              issueDate: "2026-03-26",
              requestUrl: accountCurrentUrl(owner.academyId, event.id),
              role: "admin",
            })
          ).request,
          owner.academyId,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 });

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildCancelInvoiceRequest({
              invoiceId: cancelledInvoice.id,
              reason: "No corresponde cobrar esta coreografía.",
              requestUrl: accountCurrentUrl(owner.academyId, event.id),
              role: "admin",
            })
          ).request,
          owner.academyId,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 });

    await expect(
      accountCurrentAction(
        detailActionArgs(
          (
            await buildAnnulPaymentRequest({
              paymentId: annulledPayment.id,
              reason: "Pago duplicado.",
              requestUrl: accountCurrentUrl(owner.academyId, event.id),
              role: "admin",
            })
          ).request,
          owner.academyId,
        ),
      ),
    ).rejects.toMatchObject({ status: 302 });

    const loaderData = await loadPortalAcademyFinances(
      new Request("http://localhost/portal/finanzas", {
        headers: { cookie: owner.cookie },
      }),
    );
    const markup = renderFinances(loaderData);

    expect(loaderData.summary).toEqual({
      availableBalanceAmount: 6000,
      owedAmount: { status: "complete", amount: 24300 },
      owedDepositAmount: { status: "complete", amount: 3000 },
      totalPaidAmount: 15000,
    });
    expect(loaderData.payments).toHaveLength(1);
    expect(loaderData.payments[0]).toMatchObject({
      paymentNumber: 1,
      paymentMethod: "transferencia",
      reference: "TRX-PORTAL-001",
      imputedAmount: 9000,
      availableAmount: 6000,
      amount: 15000,
    });
    expect(loaderData.payments[0]).not.toHaveProperty("internalNote");
    expect(loaderData.activeDepositInvoices).toHaveLength(3);
    expect(loaderData.activeBalanceInvoices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          administrativeDiscountPublicLabel: "Beca academia",
          amount: 6500,
        }),
        expect.objectContaining({
          administrativeDiscountPublicLabel: null,
          amount: 6800,
        }),
      ]),
    );
    expect(loaderData.activeDepositInvoices).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ choreographyName: "Cancelada" }),
      ]),
    );
    expect(loaderData.activeBalanceInvoices).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ choreographyName: "Ajena" }),
      ]),
    );
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain("Saldo adeudado");
    expect(markup).toContain("Seña adeudada");
    expect(markup).not.toContain("Monto total pagado");
    expect(markup).toContain("Pagos activos");
    expect(markup).toContain("Facturas de seña activas");
    expect(markup).toContain("Facturas de saldo activas");
    expect(markup).toContain("TRX-PORTAL-001");
    expect(markup).toContain("Beca academia");
    expect(markup).toContain("Descuento administrativo");
    expect(markup).not.toContain("Nota interna admin");
    expect(markup).not.toContain("Pago duplicado.");
    expect(markup).not.toContain("Cancelada");
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
    await createChoreographyRecord({
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
      owedAmount: {
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
    expect(markup.match(/Pendiente/g)).toHaveLength(2);
  });

  test("matches admin operational summaries for a paid seña snapshot", async () => {
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

    await registerPaymentForTest({
      academyId: owner.academyId,
      amount: "3600",
      eventId: event.id,
      paymentDate: "2026-03-21",
    });
    await issueDepositInvoiceForTest({
      academyId: owner.academyId,
      choreographyIds: [choreography.id],
      eventId: event.id,
      issueDate: "2026-03-20",
    });
    await db
      .update(academyEventChoreographyInvoices)
      .set({
        basePriceAmount: 12000,
        depositAmount: 3600,
      })
      .where(
        eq(academyEventChoreographyInvoices.choreographyId, choreography.id),
      );
    await completeDepositInvoiceForTest({
      academyId: owner.academyId,
      choreographyId: choreography.id,
      createdByUserId: owner.userId,
      eventId: event.id,
      imputationDate: "2026-03-21",
    });

    const portalLoaderData = await loadPortalAcademyFinances(
      new Request("http://localhost/portal/finanzas", {
        headers: { cookie: owner.cookie },
      }),
    );
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.portal.snapshot@example.com",
      role: "admin",
      requestUrl: accountCurrentUrl(owner.academyId, event.id),
    });
    const adminLoaderData = await accountCurrentLoader(
      detailRouteArgs(adminRequest, owner.academyId),
    );

    expect(portalLoaderData.summary).toEqual({
      availableBalanceAmount: 0,
      owedAmount: { amount: 8400, status: "complete" },
      owedDepositAmount: { amount: 0, status: "complete" },
      totalPaidAmount: 3600,
    });
    expect(adminLoaderData.summary).toEqual(portalLoaderData.summary);
    expect(adminLoaderData.choreographyFinanceRows).toMatchObject([
      {
        id: choreography.id,
        basePriceAmount: { amount: 12000, status: "complete" },
        depositAmount: { amount: 3600, status: "complete" },
        depositCompletedOn: "2026-03-21",
        financialState: "señada",
        owedAmount: { amount: 8400, status: "complete" },
        owedDepositAmount: { amount: 0, status: "complete" },
      },
    ]);
  });

  test("keeps admin and portal finance surfaces consistent across mixed choreography states", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-01",
    );

    const owner = await createAcademySession({
      email: "portal.finanzas.consistencia@example.com",
      academyName: "Academia Consistencia",
    });
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    await activateEvent(event.id);
    const catalog = await createEventCatalog(event.id);
    await db.insert(prices).values({
      amount: 10000,
      eventId: event.id,
      groupType: "solo",
      name: "Precio solo vigente",
      paymentDeadline: "2026-12-31",
      scheduleId: catalog.schedule.id,
    });
    const currentPriceChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-10T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Solo actual",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const pendingSnapshotChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-11T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Solo seña pendiente",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const paidSnapshotChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-12T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Solo seña pagada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const missingPriceChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-13T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      groupType: "duo",
      modalityId: catalog.modality.id,
      name: "Duo sin precio",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const choreographies = [
      currentPriceChoreography,
      pendingSnapshotChoreography,
      paidSnapshotChoreography,
      missingPriceChoreography,
    ];

    for (const choreography of choreographies) {
      const dancer = await createDancer(owner.academyId, {
        firstName: "Ana",
        lastName: choreography.name,
      });

      await db.insert(choreographyDancers).values({
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancer.id,
      });
    }

    await registerPaymentForTest({
      academyId: owner.academyId,
      amount: "4600",
      eventId: event.id,
      paymentDate: "2026-03-21",
    });
    await issueDepositInvoiceForTest({
      academyId: owner.academyId,
      choreographyIds: [
        pendingSnapshotChoreography.id,
        paidSnapshotChoreography.id,
      ],
      eventId: event.id,
      issueDate: "2026-03-20",
    });
    await db
      .update(academyEventChoreographyInvoices)
      .set({
        basePriceAmount: 12000,
        depositAmount: 3600,
      })
      .where(eq(academyEventChoreographyInvoices.academyId, owner.academyId));
    await completeDepositInvoiceForTest({
      academyId: owner.academyId,
      choreographyId: paidSnapshotChoreography.id,
      createdByUserId: owner.userId,
      eventId: event.id,
      imputationDate: "2026-03-21",
    });

    const portalLoaderData = await loadPortalAcademyFinances(
      new Request("http://localhost/portal/finanzas", {
        headers: { cookie: owner.cookie },
      }),
    );
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.portal.consistencia@example.com",
      role: "admin",
      requestUrl: accountCurrentUrl(owner.academyId, event.id),
    });
    const adminLoaderData = await accountCurrentLoader(
      detailRouteArgs(adminRequest, owner.academyId),
    );

    expect(portalLoaderData.summary).toEqual({
      availableBalanceAmount: 1000,
      owedAmount: {
        amount: 29400,
        missingPriceCount: 1,
        status: "incomplete",
      },
      owedDepositAmount: {
        amount: 6600,
        missingPriceCount: 1,
        status: "incomplete",
      },
      totalPaidAmount: 4600,
    });
    expect(adminLoaderData.summary).toEqual(portalLoaderData.summary);
    expect(adminLoaderData.choreographyFinanceRows).toMatchObject([
      {
        id: missingPriceChoreography.id,
        basePriceAmount: {
          amount: 0,
          missingPriceCount: 1,
          status: "incomplete",
        },
        financialState: "impaga",
        owedAmount: {
          amount: 0,
          missingPriceCount: 1,
          status: "incomplete",
        },
        owedDepositAmount: {
          amount: 0,
          missingPriceCount: 1,
          status: "incomplete",
        },
      },
      {
        id: currentPriceChoreography.id,
        basePriceAmount: { amount: 10000, status: "complete" },
        financialState: "impaga",
        owedAmount: { amount: 10000, status: "complete" },
        owedDepositAmount: { amount: 3000, status: "complete" },
      },
      {
        id: paidSnapshotChoreography.id,
        basePriceAmount: { amount: 12000, status: "complete" },
        depositCompletedOn: "2026-03-21",
        financialState: "señada",
        owedAmount: { amount: 8400, status: "complete" },
        owedDepositAmount: { amount: 0, status: "complete" },
      },
      {
        id: pendingSnapshotChoreography.id,
        basePriceAmount: { amount: 12000, status: "complete" },
        financialState: "impaga",
        owedAmount: { amount: 12000, status: "complete" },
        owedDepositAmount: { amount: 3600, status: "complete" },
      },
    ]);

    const currentPriceDetail =
      await loadAdministrativeChoreographyFinanceDetail(
        choreographyDetailRouteArgs(
          (
            await createSignedInRequest({
              email: "admin.detalle.actual@example.com",
              role: "admin",
              requestUrl: choreographyFinanceDetailUrl({
                academyId: owner.academyId,
                choreographyId: currentPriceChoreography.id,
                eventId: event.id,
              }),
            })
          ).request,
          owner.academyId,
          currentPriceChoreography.id,
        ),
      );
    const pendingSnapshotDetail =
      await loadAdministrativeChoreographyFinanceDetail(
        choreographyDetailRouteArgs(
          (
            await createSignedInRequest({
              email: "admin.detalle.pendiente@example.com",
              role: "admin",
              requestUrl: choreographyFinanceDetailUrl({
                academyId: owner.academyId,
                choreographyId: pendingSnapshotChoreography.id,
                eventId: event.id,
              }),
            })
          ).request,
          owner.academyId,
          pendingSnapshotChoreography.id,
        ),
      );
    const paidSnapshotDetail =
      await loadAdministrativeChoreographyFinanceDetail(
        choreographyDetailRouteArgs(
          (
            await createSignedInRequest({
              email: "admin.detalle.pagada@example.com",
              role: "admin",
              requestUrl: choreographyFinanceDetailUrl({
                academyId: owner.academyId,
                choreographyId: paidSnapshotChoreography.id,
                eventId: event.id,
              }),
            })
          ).request,
          owner.academyId,
          paidSnapshotChoreography.id,
        ),
      );
    const missingPriceDetail =
      await loadAdministrativeChoreographyFinanceDetail(
        choreographyDetailRouteArgs(
          (
            await createSignedInRequest({
              email: "admin.detalle.sin.precio@example.com",
              role: "admin",
              requestUrl: choreographyFinanceDetailUrl({
                academyId: owner.academyId,
                choreographyId: missingPriceChoreography.id,
                eventId: event.id,
              }),
            })
          ).request,
          owner.academyId,
          missingPriceChoreography.id,
        ),
      );

    expect(currentPriceDetail.choreography).toMatchObject({
      depositAmount: { amount: 3000, status: "complete" },
      owedAmount: { amount: 10000, status: "complete" },
      paidAmount: 0,
    });
    expect(currentPriceDetail.participations).toEqual([
      expect.objectContaining({
        basePriceAmount: 10000,
        finalPriceAmount: 10000,
      }),
    ]);
    expect(pendingSnapshotDetail.choreography).toMatchObject({
      depositAmount: { amount: 3600, status: "complete" },
      owedAmount: { amount: 12000, status: "complete" },
      paidAmount: 0,
    });
    expect(pendingSnapshotDetail.participations).toEqual([
      expect.objectContaining({
        basePriceAmount: 12000,
        finalPriceAmount: 12000,
      }),
    ]);
    expect(paidSnapshotDetail.choreography).toMatchObject({
      depositAmount: { amount: 3600, status: "complete" },
      depositCompletedOn: "2026-03-21",
      owedAmount: { amount: 8400, status: "complete" },
      paidAmount: 3600,
    });
    expect(paidSnapshotDetail.participations).toEqual([
      expect.objectContaining({
        basePriceAmount: 12000,
        finalPriceAmount: 12000,
      }),
    ]);
    expect(missingPriceDetail.choreography).toMatchObject({
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
      paidAmount: 0,
    });
    expect(missingPriceDetail.participations).toEqual([
      expect.objectContaining({
        basePriceAmount: null,
        finalPriceAmount: null,
      }),
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

function choreographyFinanceDetailUrl(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}) {
  return `http://localhost/administracion/finanzas/${input.academyId}/coreografias/${input.choreographyId}?evento=${input.eventId}`;
}

function choreographyDetailRouteArgs(
  request: Request,
  academyId: string,
  choreographyId: string,
) {
  return {
    request,
    params: { academyId, choreographyId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/finanzas/:academyId/coreografias/:choreographyId",
  };
}

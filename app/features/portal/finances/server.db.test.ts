import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { academyEventPayments } from "@/db/schema";
import {
  createChoreographyRecord,
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
import { action as accountCurrentAction } from "@/routes/administracion.academias_.$academyId";
import { loader as portalFinanzasLoader } from "@/routes/portal.finanzas";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  accountCurrentUrl,
  buildAnnulImputationRequest,
  buildAnnulPaymentRequest,
  buildBalanceInvoiceIssueRequest,
  buildCancelInvoiceRequest,
  buildPaymentImputationRequest,
  createSavedEvent,
  detailActionArgs,
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

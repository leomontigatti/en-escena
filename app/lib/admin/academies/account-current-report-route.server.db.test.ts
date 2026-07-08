import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createEventCatalog,
  date as choreographyDate,
} from "@/features/portal/choreographies/test-support/db";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { loadAdminInvoicesList } from "@/features/admin/invoices/list/server";
import { loader as academiesLoader } from "@/routes/administracion.academias";
import { loader as financeInvoicesLoader } from "@/routes/administracion.facturas";
import { loader as legacyReportLoader } from "@/routes/administracion.academias.reporte";
import { loader as financeAccountsLoader } from "@/routes/administracion.finanzas";
import { loader as financePaymentsLoader } from "@/routes/administracion.pagos";
import {
  action as paymentCreateAction,
  loader as paymentCreateLoader,
} from "@/routes/administracion.pagos_.nuevo";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  accountCurrentUrl,
  buildAnnulImputationRequest,
  buildAnnulPaymentRequest,
  buildBalanceInvoiceIssueRequest,
  buildCancelInvoiceRequest,
  buildGlobalPaymentRequest,
  buildPaymentImputationRequest,
  createAcademyUser,
  createInactiveEvent,
  createSavedEvent,
  createSignedInRequest,
  detailActionArgs,
  issueDepositInvoiceForTest,
  registerPaymentForTest,
  renderAcademiesRoute,
  reportRouteArgs,
  reportUrl,
  routeArgs,
  renderFinanceAccountsRoute,
  renderFinanceInvoicesRoute,
  renderFinancePaymentsRoute,
  paymentCreateRouteArgs,
} from "./account-current-route.test-support";
import { action as accountCurrentAction } from "@/routes/administracion.academias_.$academyId";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

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
    const northChoreography = await createChoreographyRecord({
      academyId: academyNorth.academy.id,
      categoryId: eventCatalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-10T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: eventCatalog.level.id,
      modalityId: eventCatalog.modality.id,
      name: "Norte Activa",
      scheduleCapacityId: eventCatalog.scheduleCapacity.id,
      submodalityId: eventCatalog.submodality.id,
    });
    await createChoreographyRecord({
      academyId: academyNorth.academy.id,
      categoryId: eventCatalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-12T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: eventCatalog.level.id,
      modalityId: eventCatalog.modality.id,
      name: "Norte Segunda",
      scheduleCapacityId: eventCatalog.scheduleCapacity.id,
      submodalityId: eventCatalog.submodality.id,
    });
    const northPaidChoreography = await createChoreographyRecord({
      academyId: academyNorth.academy.id,
      categoryId: eventCatalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-13T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: eventCatalog.level.id,
      modalityId: eventCatalog.modality.id,
      name: "Norte Pagada",
      scheduleCapacityId: eventCatalog.scheduleCapacity.id,
      submodalityId: eventCatalog.submodality.id,
    });
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

    await registerPaymentForTest({
      academyId: academyNorth.academy.id,
      amount: "20000",
      eventId: event.id,
      paymentDate: "2026-03-15",
    });
    await db.insert(academyEventPayments).values({
      academyId: academyNorth.academy.id,
      amount: 3333,
      createdByUserId: academyNorth.user.id,
      eventId: otherEvent.id,
      paymentDate: "2026-03-14",
      paymentMethod: "transferencia",
      paymentNumber: 1,
    });
    await registerPaymentForTest({
      academyId: academySouth.academy.id,
      amount: "2000",
      eventId: event.id,
      paymentDate: "2026-03-16",
    });

    await issueDepositInvoiceForTest({
      academyId: academyNorth.academy.id,
      choreographyIds: [northChoreography.id, northPaidChoreography.id],
      eventId: event.id,
      issueDate: "2026-03-20",
    });
    await issueDepositInvoiceForTest({
      academyId: academySouth.academy.id,
      choreographyIds: [southChoreography.id],
      eventId: event.id,
      issueDate: "2026-03-20",
    });

    const northPayment = (
      await db.query.academyEventPayments.findMany({
        where: eq(academyEventPayments.academyId, academyNorth.academy.id),
      })
    ).find((payment) => payment.eventId === event.id);
    const southPayment = (
      await db.query.academyEventPayments.findMany({
        where: eq(academyEventPayments.academyId, academySouth.academy.id),
      })
    ).find((payment) => payment.eventId === event.id);
    const [northInvoice] =
      await db.query.academyEventChoreographyInvoices.findMany({
        where: eq(
          academyEventChoreographyInvoices.choreographyId,
          northChoreography.id,
        ),
      });
    const [northPaidDepositInvoice] =
      await db.query.academyEventChoreographyInvoices.findMany({
        where: eq(
          academyEventChoreographyInvoices.choreographyId,
          northPaidChoreography.id,
        ),
      });
    const [southInvoice] =
      await db.query.academyEventChoreographyInvoices.findMany({
        where: eq(
          academyEventChoreographyInvoices.choreographyId,
          southChoreography.id,
        ),
      });

    if (
      !northPayment ||
      !southPayment ||
      !northInvoice ||
      !northPaidDepositInvoice ||
      !southInvoice
    ) {
      throw new Error("Expected payments and invoices for the report test.");
    }

    const { request: northImputationRequest } =
      await buildPaymentImputationRequest({
        amount: "3000",
        imputationDate: "2026-03-21",
        invoiceId: northInvoice.id,
        paymentId: northPayment.id,
        requestUrl: accountCurrentUrl(academyNorth.academy.id, event.id),
        role: "admin",
      });
    await expect(
      accountCurrentAction(
        detailActionArgs(northImputationRequest, academyNorth.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: northPaidDepositImputationRequest } =
      await buildPaymentImputationRequest({
        amount: "3000",
        imputationDate: "2026-03-21",
        invoiceId: northPaidDepositInvoice.id,
        paymentId: northPayment.id,
        requestUrl: accountCurrentUrl(academyNorth.academy.id, event.id),
        role: "admin",
      });
    await expect(
      accountCurrentAction(
        detailActionArgs(
          northPaidDepositImputationRequest,
          academyNorth.academy.id,
        ),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: northBalanceIssueRequest } =
      await buildBalanceInvoiceIssueRequest({
        administrativeDiscountAmount: "1000",
        administrativeDiscountInternalReason: "Descuento operativo.",
        choreographyId: northChoreography.id,
        issueDate: "2026-03-22",
        requestUrl: accountCurrentUrl(academyNorth.academy.id, event.id),
        role: "admin",
      });
    await expect(
      accountCurrentAction(
        detailActionArgs(northBalanceIssueRequest, academyNorth.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: northPaidBalanceIssueRequest } =
      await buildBalanceInvoiceIssueRequest({
        choreographyId: northPaidChoreography.id,
        issueDate: "2026-03-22",
        requestUrl: accountCurrentUrl(academyNorth.academy.id, event.id),
        role: "admin",
      });
    await expect(
      accountCurrentAction(
        detailActionArgs(northPaidBalanceIssueRequest, academyNorth.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const northPaidBalanceInvoice = (
      await db.query.academyEventChoreographyInvoices.findMany({
        where: eq(
          academyEventChoreographyInvoices.choreographyId,
          northPaidChoreography.id,
        ),
      })
    ).find((invoice) => invoice.invoiceType === "saldo");

    if (!northPaidBalanceInvoice) {
      throw new Error("Expected paid choreography balance invoice.");
    }

    const { request: northPaidBalanceImputationRequest } =
      await buildPaymentImputationRequest({
        amount: "7000",
        imputationDate: "2026-03-23",
        invoiceId: northPaidBalanceInvoice.id,
        paymentId: northPayment.id,
        requestUrl: accountCurrentUrl(academyNorth.academy.id, event.id),
        role: "admin",
      });
    await expect(
      accountCurrentAction(
        detailActionArgs(
          northPaidBalanceImputationRequest,
          academyNorth.academy.id,
        ),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: southImputationRequest } =
      await buildPaymentImputationRequest({
        amount: "2000",
        imputationDate: "2026-03-21",
        invoiceId: southInvoice.id,
        paymentId: southPayment.id,
        requestUrl: accountCurrentUrl(academySouth.academy.id, event.id),
        role: "admin",
      });
    await expect(
      accountCurrentAction(
        detailActionArgs(southImputationRequest, academySouth.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const [southImputation] =
      await db.query.academyEventInvoiceImputations.findMany({
        where: eq(academyEventInvoiceImputations.invoiceId, southInvoice.id),
      });

    if (!southImputation) {
      throw new Error("Expected imputation for the report test.");
    }

    const { request: cancelInvoiceRequest } = await buildCancelInvoiceRequest({
      invoiceId: southInvoice.id,
      reason: "Factura emitida por error.",
      requestUrl: accountCurrentUrl(academySouth.academy.id, event.id),
      role: "admin",
    });
    const cancelInvoiceResult = await accountCurrentAction(
      detailActionArgs(cancelInvoiceRequest, academySouth.academy.id),
    );

    expect(cancelInvoiceResult).toMatchObject({
      status: "error",
    });

    const { request: annulImputationRequest } =
      await buildAnnulImputationRequest({
        imputationId: southImputation.id,
        reason: "Imputación aplicada a una factura incorrecta.",
        requestUrl: accountCurrentUrl(academySouth.academy.id, event.id),
        role: "admin",
      });
    await expect(
      accountCurrentAction(
        detailActionArgs(annulImputationRequest, academySouth.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: cancelledInvoiceRequest } =
      await buildCancelInvoiceRequest({
        invoiceId: southInvoice.id,
        reason: "Factura emitida por error.",
        requestUrl: accountCurrentUrl(academySouth.academy.id, event.id),
        role: "admin",
      });
    await expect(
      accountCurrentAction(
        detailActionArgs(cancelledInvoiceRequest, academySouth.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: annulPaymentRequest } = await buildAnnulPaymentRequest({
      paymentId: southPayment.id,
      reason: "Pago duplicado.",
      requestUrl: accountCurrentUrl(academySouth.academy.id, event.id),
      role: "admin",
    });
    await expect(
      accountCurrentAction(
        detailActionArgs(annulPaymentRequest, academySouth.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: listRequest } = await createSignedInRequest({
      email: "admin.reporte.lista@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/academias?evento=${event.id}`,
    });
    const academiesLoaderData = await academiesLoader(routeArgs(listRequest));
    const academiesMarkup = renderAcademiesRoute({
      loaderData: academiesLoaderData,
    });

    expect(academiesMarkup).not.toContain('aria-label="Acciones"');
    expect(academiesMarkup).not.toContain(
      '<a href="/administracion/academias/reporte"',
    );
    expect(academiesMarkup).not.toContain(
      `/administracion/academias/${academyNorth.academy.id}`,
    );

    const { request: financesRequest } = await createSignedInRequest({
      email: "admin.reporte@example.com",
      role: "admin",
      requestUrl: reportUrl(event.id),
    });

    const loaderData = await financeAccountsLoader(
      reportRouteArgs(financesRequest),
    );
    const markup = renderFinanceAccountsRoute({
      loaderData,
    });

    expect(loaderData.selectedEventId).toBe(event.id);
    expect(loaderData.rows).toEqual([
      {
        academyId: academyNorth.academy.id,
        academyName: "Academia Norte",
        availableBalanceAmount: 7000,
        owedAmount: { status: "complete", amount: 9000 },
        owedDepositAmount: { status: "complete", amount: 3000 },
      },
      {
        academyId: academySouth.academy.id,
        academyName: "Academia Sur",
        availableBalanceAmount: 0,
        owedAmount: { status: "complete", amount: 10000 },
        owedDepositAmount: { status: "complete", amount: 3000 },
      },
    ]);
    expect(markup).toContain("Resumen");
    expect(markup).toContain(
      `/administracion/finanzas/${academyNorth.academy.id}`,
    );
    expect(markup).toContain("Seña adeudada");
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain("Saldo adeudado");
    expect(markup).toMatch(/<button[^>]*>Nombre/);
    expect(markup).not.toMatch(/<button[^>]*>Seña adeudada/);
    expect(markup).not.toMatch(/<button[^>]*>Saldo disponible/);
    expect(markup).not.toMatch(/<button[^>]*>Saldo adeudado/);
    expect(markup).not.toContain("Total pagado");
    expect(markup).not.toContain("Total estimado");
    expect(markup).not.toContain("Seña estimada");
    expect(markup).not.toContain("Facturas pendientes");
    expect(markup).not.toContain("Pagos sin imputar");
    expect(markup).not.toContain("Mixto");
    expect(markup).toContain("$ 9.000");
    expect(markup).toContain("$ 10.000");
    expect(markup).toContain("$ 7.000");
    expect(markup).toContain("$ 3.000");
    expect(markup).not.toContain("$ 20.000");
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
    await createChoreographyRecord({
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

    const { request } = await createSignedInRequest({
      email: "admin.precio.pendiente@example.com",
      role: "admin",
      requestUrl: reportUrl(event.id),
    });

    const loaderData = await financeAccountsLoader(reportRouteArgs(request));
    const markup = renderFinanceAccountsRoute({
      loaderData,
    });

    expect(loaderData.rows).toEqual([
      {
        academyId: academy.academy.id,
        academyName: "Academia Sin Precio",
        availableBalanceAmount: 0,
        owedAmount: {
          status: "incomplete",
          amount: 0,
          missingPriceCount: 1,
        },
        owedDepositAmount: {
          status: "incomplete",
          amount: 0,
          missingPriceCount: 1,
        },
      },
    ]);
    expect(markup.match(/Pendiente/g)).toHaveLength(2);
  });
  test("renders payment and invoice control lists for the active event", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const academy = await createAcademyUser({
      email: "academia.finanzas.listas@example.com",
      academyName: "Academia Listas",
    });
    const eventCatalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: eventCatalog.categoryWithLevel.id,
      createdAt: choreographyDate("2026-03-10T12:00:00Z"),
      eventId: event.id,
      experienceLevelId: eventCatalog.level.id,
      modalityId: eventCatalog.modality.id,
      name: "Coreografía Facturada",
      scheduleCapacityId: eventCatalog.scheduleCapacity.id,
      submodalityId: eventCatalog.submodality.id,
    });

    await registerPaymentForTest({
      academyId: academy.academy.id,
      amount: "5000",
      eventId: event.id,
      paymentDate: "2026-03-15",
    });
    await registerPaymentForTest({
      academyId: academy.academy.id,
      amount: "7000",
      eventId: event.id,
      paymentDate: "2026-03-16",
    });
    await issueDepositInvoiceForTest({
      academyId: academy.academy.id,
      choreographyIds: [choreography.id],
      eventId: event.id,
      issueDate: "2026-03-20",
    });

    const [payment] = await db.query.academyEventPayments.findMany({
      where: eq(academyEventPayments.paymentDate, "2026-03-15"),
    });
    const [invoice] = await db.query.academyEventChoreographyInvoices.findMany({
      where: eq(
        academyEventChoreographyInvoices.choreographyId,
        choreography.id,
      ),
    });

    if (!payment || !invoice) {
      throw new Error("Expected payment and invoice for finance lists.");
    }

    const { request: imputationRequest } = await buildPaymentImputationRequest({
      amount: "1000",
      imputationDate: "2026-03-21",
      invoiceId: invoice.id,
      paymentId: payment.id,
      requestUrl: accountCurrentUrl(academy.academy.id, event.id),
      role: "admin",
    });
    await expect(
      accountCurrentAction(
        detailActionArgs(imputationRequest, academy.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const [annullablePayment] = await db.query.academyEventPayments.findMany({
      where: eq(academyEventPayments.paymentDate, "2026-03-16"),
    });

    if (!annullablePayment) {
      throw new Error("Expected annullable payment for finance lists.");
    }

    const { request: annulPaymentRequest } = await buildAnnulPaymentRequest({
      paymentId: annullablePayment.id,
      reason: "Pago duplicado en conciliación.",
      requestUrl: accountCurrentUrl(academy.academy.id, event.id),
      role: "admin",
    });
    await expect(
      accountCurrentAction(
        detailActionArgs(annulPaymentRequest, academy.academy.id),
      ),
    ).rejects.toMatchObject({
      status: 302,
    });

    const { request: paymentsRequest } = await createSignedInRequest({
      email: "admin.finanzas.pagos@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/pagos?evento=${event.id}`,
    });
    const paymentsData = await financePaymentsLoader(
      reportRouteArgs(paymentsRequest),
    );
    const paymentsMarkup = renderFinancePaymentsRoute({
      loaderData: paymentsData,
    });

    expect(paymentsData.rows).toEqual([
      expect.objectContaining({
        academyName: "Academia Listas",
        amount: 5000,
        paymentDate: "2026-03-15",
        paymentMethod: "transferencia",
        paymentNumber: 1,
      }),
    ]);
    expect(paymentsMarkup).toContain("Pagos");
    expect(paymentsMarkup).toContain("Nuevo pago");
    expect(paymentsMarkup).toContain("/administracion/pagos/nuevo");
    expect(paymentsMarkup).toContain("Transferencia");
    expect(paymentsMarkup).toContain("$ 5.000");
    expect(paymentsMarkup).not.toContain("$ 7.000");

    const { request: annulledPaymentsRequest } = await createSignedInRequest({
      email: "admin.finanzas.pagos.anulados@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/pagos?evento=${event.id}&estado=anulados`,
    });
    const annulledPaymentsData = await financePaymentsLoader(
      reportRouteArgs(annulledPaymentsRequest),
    );
    const annulledPaymentsMarkup = renderFinancePaymentsRoute({
      loaderData: annulledPaymentsData,
    });

    expect(annulledPaymentsData.rows).toEqual([
      expect.objectContaining({
        academyName: "Academia Listas",
        amount: 7000,
        paymentDate: "2026-03-16",
        paymentMethod: "transferencia",
        paymentNumber: 2,
      }),
    ]);
    expect(annulledPaymentsMarkup).toContain("Anulado");
    expect(annulledPaymentsMarkup).toContain("$ 7.000");
    expect(annulledPaymentsMarkup).not.toContain("$ 5.000");

    const { request: invoicesRequest } = await createSignedInRequest({
      email: "admin.finanzas.facturas@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/facturas?evento=${event.id}`,
    });
    let invoicesRedirect: Response | null = null;

    try {
      await financeInvoicesLoader(reportRouteArgs(invoicesRequest));
    } catch (error) {
      invoicesRedirect = error as Response;
    }

    expect(invoicesRedirect).toMatchObject({ status: 302 });
    expect(invoicesRedirect?.headers.get("location")).toBe("/administracion");

    const invoicesData = await loadAdminInvoicesList(invoicesRequest);
    const invoicesMarkup = renderFinanceInvoicesRoute({
      loaderData: invoicesData,
    });

    expect(invoicesData.rows).toEqual([
      expect.objectContaining({
        academyName: "Academia Listas",
        amount: 3000,
        choreographyName: "Coreografía Facturada",
        imputedAmount: 1000,
        invoiceType: "sena",
        pendingAmount: 2000,
        status: "parcial",
      }),
    ]);
    expect(invoicesMarkup).toContain("Facturas");
    expect(invoicesMarkup).toContain("Coreografía Facturada");
    expect(invoicesMarkup).toContain("Parcial");
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

    const payments = await db.query.academyEventPayments.findMany({
      where: eq(academyEventPayments.academyId, academy.academy.id),
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

    const loaderData = await financeAccountsLoader(reportRouteArgs(request));
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
      requestUrl: reportUrl(event.id),
    });

    await expect(
      financeAccountsLoader(reportRouteArgs(auditorRequest)),
    ).resolves.toMatchObject({
      selectedEventId: event.id,
    });

    const { request: academyRequest } = await createSignedInRequest({
      email: "academia.reporte.bloqueada@example.com",
      role: "academy",
      requestUrl: reportUrl(event.id),
    });

    await expect(
      financeAccountsLoader(reportRouteArgs(academyRequest)),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  test("redirects the legacy account-current report URL to finances", async () => {
    const event = await createSavedEvent();
    const { request } = await createSignedInRequest({
      email: "admin.reporte.legacy@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/academias/reporte?evento=${event.id}`,
    });

    await expect(
      legacyReportLoader(reportRouteArgs(request)),
    ).rejects.toMatchObject({
      status: 302,
      headers: expect.objectContaining({
        get: expect.any(Function),
      }),
    });
  });
});

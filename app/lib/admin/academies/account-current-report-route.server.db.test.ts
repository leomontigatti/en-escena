import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

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
import { loader as academiesLoader } from "@/routes/administracion.academias";
import { loader as reportLoader } from "@/routes/administracion.academias.reporte";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  accountCurrentUrl,
  buildAnnulImputationRequest,
  buildAnnulPaymentRequest,
  buildCancelInvoiceRequest,
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
  renderAccountCurrentReportRoute,
  routeArgs,
} from "./account-current-route.test-support";
import { action as accountCurrentAction } from "@/routes/administracion.academias_.$academyId";

installDatabaseTestHooks();

describe.sequential("administracion academias reporte cuenta corriente", () => {
  test("lets admin open the report from academies and renders event-scoped academy balances", async () => {
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
      amount: "10000",
      eventId: event.id,
      paymentDate: "2026-03-15",
    });
    await db.insert(academyEventPayments).values({
      academyId: academyNorth.academy.id,
      amount: 3000,
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
      choreographyIds: [northChoreography.id],
      eventId: event.id,
      issueDate: "2026-03-20",
    });
    await issueDepositInvoiceForTest({
      academyId: academySouth.academy.id,
      choreographyIds: [southChoreography.id],
      eventId: event.id,
      issueDate: "2026-03-20",
    });

    const [northPayment] = await db.query.academyEventPayments.findMany({
      where: eq(academyEventPayments.academyId, academyNorth.academy.id),
    });
    const [southPayment] = await db.query.academyEventPayments.findMany({
      where: eq(academyEventPayments.academyId, academySouth.academy.id),
    });
    const [northInvoice] =
      await db.query.academyEventChoreographyInvoices.findMany({
        where: eq(
          academyEventChoreographyInvoices.choreographyId,
          northChoreography.id,
        ),
      });
    const [southInvoice] =
      await db.query.academyEventChoreographyInvoices.findMany({
        where: eq(
          academyEventChoreographyInvoices.choreographyId,
          southChoreography.id,
        ),
      });

    if (!northPayment || !southPayment || !northInvoice || !southInvoice) {
      throw new Error("Expected payments and invoices for the report test.");
    }

    const { request: northImputationRequest } =
      await buildPaymentImputationRequest({
        amount: "1000",
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

    expect(academiesMarkup).toContain("/administracion/academias/reporte");
    expect(academiesMarkup).toContain("Reporte de cuenta corriente");

    const { request: reportRequest } = await createSignedInRequest({
      email: "admin.reporte@example.com",
      role: "admin",
      requestUrl: reportUrl(event.id),
    });

    const loaderData = await reportLoader(reportRouteArgs(reportRequest));
    const markup = renderAccountCurrentReportRoute({
      loaderData,
    });

    expect(loaderData.selectedEventId).toBe(event.id);
    expect(loaderData.rows).toEqual([
      {
        academyId: academyNorth.academy.id,
        academyName: "Academia Norte",
        availableBalanceAmount: 9000,
        owedAmount: 2000,
        totalPaidAmount: 10000,
      },
      {
        academyId: academySouth.academy.id,
        academyName: "Academia Sur",
        availableBalanceAmount: 0,
        owedAmount: 0,
        totalPaidAmount: 0,
      },
    ]);
    expect(markup).toContain("Reporte de cuenta corriente");
    expect(markup).toContain("Monto total pagado");
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain("Saldo adeudado");
    expect(markup).toContain("$ 10.000");
    expect(markup).toContain("$ 9.000");
    expect(markup).toContain("$ 2.000");
    expect(markup).not.toContain("Academia Fantasma");
    expect(markup).not.toContain("$ 3.000");
  });

  test("shows the blocked state when there is no active event", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.reporte.sin.evento@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/academias/reporte",
    });

    const loaderData = await reportLoader(reportRouteArgs(request));
    const markup = renderAccountCurrentReportRoute({
      loaderData,
    });

    expect(loaderData.selectedEventId).toBeNull();
    expect(markup).toContain("No hay un evento activo para reportar");
  });

  test("allows auditor access and blocks academy users", async () => {
    const event = await createSavedEvent();
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.reporte.finanzas@example.com",
      role: "auditor",
      requestUrl: reportUrl(event.id),
    });

    await expect(
      reportLoader(reportRouteArgs(auditorRequest)),
    ).resolves.toMatchObject({
      selectedEventId: event.id,
    });

    const { request: academyRequest } = await createSignedInRequest({
      email: "academia.reporte.bloqueada@example.com",
      role: "academy",
      requestUrl: reportUrl(event.id),
    });

    await expect(
      reportLoader(reportRouteArgs(academyRequest)),
    ).rejects.toMatchObject({
      status: 403,
    });
  });
});

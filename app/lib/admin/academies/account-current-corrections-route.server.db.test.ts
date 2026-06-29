import { and, eq, isNull } from "drizzle-orm";
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
import {
  action as accountCurrentAction,
  loader as accountCurrentLoader,
} from "@/routes/administracion.academias_.$academyId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  accountCurrentUrl,
  buildAnnulImputationRequest,
  buildAnnulPaymentRequest,
  buildCancelInvoiceRequest,
  buildPaymentImputationRequest,
  createAcademyUser,
  createSavedEvent,
  createSignedInRequest,
  detailActionArgs,
  detailRouteArgs,
  issueDepositInvoiceForTest,
  registerPaymentForTest,
  renderAccountCurrentRoute,
} from "./account-current-route.test-support";

installDatabaseTestHooks();

describe.sequential(
  "administracion academias cuenta corriente corrections",
  () => {
    test("annuls imputations, blocks dependent corrections, and shows auditable movement history read-only for auditors", async () => {
      const event = await createSavedEvent({
        requiredDepositPercentage: 30,
      });
      const academy = await createAcademyUser({
        email: "academia.correcciones.finanzas@example.com",
        academyName: "Academia Correcciones",
      });
      const catalog = await createEventCatalog(event.id);
      const choreography = await createChoreographyRecord({
        academyId: academy.academy.id,
        categoryId: catalog.categoryWithLevel.id,
        createdAt: choreographyDate("2026-03-10T12:00:00Z"),
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        modalityId: catalog.modality.id,
        name: "Corregible",
        scheduleCapacityId: catalog.scheduleCapacity.id,
        submodalityId: catalog.submodality.id,
      });

      await registerPaymentForTest({
        academyId: academy.academy.id,
        amount: "3000",
        eventId: event.id,
        paymentDate: "2026-03-15",
      });
      await issueDepositInvoiceForTest({
        academyId: academy.academy.id,
        choreographyIds: [choreography.id],
        eventId: event.id,
        issueDate: "2026-03-20",
      });

      const [payment] = await db.query.academyEventPayments.findMany({
        where: eq(academyEventPayments.academyId, academy.academy.id),
      });
      const [invoice] =
        await db.query.academyEventChoreographyInvoices.findMany({
          where: eq(
            academyEventChoreographyInvoices.choreographyId,
            choreography.id,
          ),
        });

      if (!payment || !invoice) {
        throw new Error("Expected payment and invoice fixtures to exist.");
      }

      const { request: imputationRequest } =
        await buildPaymentImputationRequest({
          amount: "3000",
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

      const [imputation] =
        await db.query.academyEventInvoiceImputations.findMany({
          where: eq(academyEventInvoiceImputations.invoiceId, invoice.id),
        });

      if (!imputation) {
        throw new Error("Expected imputation fixture to exist.");
      }

      const { request: blankReasonRequest } = await buildAnnulImputationRequest(
        {
          imputationId: imputation.id,
          reason: "",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        },
      );

      const blankReasonResult = await accountCurrentAction(
        detailActionArgs(blankReasonRequest, academy.academy.id),
      );

      expect(blankReasonResult).toMatchObject({
        status: "error",
        message: "Revisá los datos de la corrección.",
        fieldErrors: {
          reason: "Ingresá un motivo para registrar esta corrección.",
        },
      });

      const { request: blockedInvoiceRequest } =
        await buildCancelInvoiceRequest({
          invoiceId: invoice.id,
          reason: "Cancelación administrativa de prueba.",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });
      const blockedInvoiceResult = await accountCurrentAction(
        detailActionArgs(blockedInvoiceRequest, academy.academy.id),
      );

      expect(blockedInvoiceResult).toMatchObject({
        status: "error",
        message: "No pudimos registrar la corrección.",
        fieldErrors: {
          invoiceId: "Anulá primero las imputaciones activas de esta factura.",
        },
      });

      const { request: blockedPaymentRequest } = await buildAnnulPaymentRequest(
        {
          paymentId: payment.id,
          reason: "Anulación administrativa de prueba.",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        },
      );
      const blockedPaymentResult = await accountCurrentAction(
        detailActionArgs(blockedPaymentRequest, academy.academy.id),
      );

      expect(blockedPaymentResult).toMatchObject({
        status: "error",
        message: "No pudimos registrar la corrección.",
        fieldErrors: {
          paymentId: "Anulá primero las imputaciones activas de este Pago.",
        },
      });

      const { request: annulImputationRequest, userId: annullingUserId } =
        await buildAnnulImputationRequest({
          imputationId: imputation.id,
          reason: "Carga duplicada en conciliación.",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      await expect(
        accountCurrentAction(
          detailActionArgs(annulImputationRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      await expect(
        db.query.academyEventInvoiceImputations.findFirst({
          where: eq(academyEventInvoiceImputations.id, imputation.id),
        }),
      ).resolves.toMatchObject({
        annulledAt: expect.any(Date),
        annulledByUserId: annullingUserId,
        annulledReason: "Carga duplicada en conciliación.",
      });

      const loaderAfterAnnulment = await accountCurrentLoader(
        detailRouteArgs(
          new Request(accountCurrentUrl(academy.academy.id, event.id), {
            headers: {
              cookie: annulImputationRequest.headers.get("cookie") ?? "",
            },
          }),
          academy.academy.id,
        ),
      );

      expect(loaderAfterAnnulment.summary).toEqual({
        availableBalanceAmount: 3000,
        owedAmount: 3000,
        totalPaidAmount: 3000,
      });
      expect(loaderAfterAnnulment.imputations).toEqual([]);
      expect(loaderAfterAnnulment.activeDepositInvoices).toMatchObject([
        {
          id: invoice.id,
          choreographyFinancialState: "impaga",
          imputedAmount: 0,
          pendingAmount: 3000,
          status: "pendiente",
        },
      ]);
      expect(loaderAfterAnnulment.payments).toMatchObject([
        {
          id: payment.id,
          availableAmount: 3000,
          imputedAmount: 0,
        },
      ]);

      const { request: cancelInvoiceRequest, userId: cancellingUserId } =
        await buildCancelInvoiceRequest({
          invoiceId: invoice.id,
          reason: "Factura emitida sobre una coreografía equivocada.",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      await expect(
        accountCurrentAction(
          detailActionArgs(cancelInvoiceRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const { request: cancelledInvoiceImputationRequest } =
        await buildPaymentImputationRequest({
          amount: "3000",
          imputationDate: "2026-03-22",
          invoiceId: invoice.id,
          paymentId: payment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const cancelledInvoiceImputationResult = await accountCurrentAction(
        detailActionArgs(cancelledInvoiceImputationRequest, academy.academy.id),
      );

      expect(cancelledInvoiceImputationResult).toMatchObject({
        status: "error",
        message: "Revisá los datos de la imputación.",
        fieldErrors: {
          paymentId: "Pago o factura inválidos para esta academia.",
        },
      });

      const { request: annulPaymentRequest, userId: annullingPaymentUserId } =
        await buildAnnulPaymentRequest({
          paymentId: payment.id,
          reason: "Pago cargado en la academia equivocada.",
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

      const [annulledImputation, cancelledInvoice, annulledPayment] =
        await Promise.all([
          db.query.academyEventInvoiceImputations.findFirst({
            where: eq(academyEventInvoiceImputations.id, imputation.id),
          }),
          db.query.academyEventChoreographyInvoices.findFirst({
            where: eq(academyEventChoreographyInvoices.id, invoice.id),
          }),
          db.query.academyEventPayments.findFirst({
            where: eq(academyEventPayments.id, payment.id),
          }),
        ]);

      expect(annulledImputation).toMatchObject({
        annulledAt: expect.any(Date),
        annulledByUserId: annullingUserId,
        annulledReason: "Carga duplicada en conciliación.",
      });
      expect(cancelledInvoice).toMatchObject({
        cancelledAt: expect.any(Date),
        cancelledByUserId: cancellingUserId,
        cancelledReason: "Factura emitida sobre una coreografía equivocada.",
      });
      expect(annulledPayment).toMatchObject({
        annulledAt: expect.any(Date),
        annulledByUserId: annullingPaymentUserId,
        annulledReason: "Pago cargado en la academia equivocada.",
      });

      await expect(
        db.query.academyEventInvoiceImputations.findFirst({
          where: and(
            eq(academyEventInvoiceImputations.id, imputation.id),
            isNull(academyEventInvoiceImputations.annulledAt),
          ),
        }),
      ).resolves.toBeUndefined();

      const { request: auditorRequest } = await createSignedInRequest({
        email: "auditor.correcciones.finanzas@example.com",
        role: "auditor",
        requestUrl: accountCurrentUrl(academy.academy.id, event.id),
      });
      const finalLoaderData = await accountCurrentLoader(
        detailRouteArgs(auditorRequest, academy.academy.id),
      );
      const finalMarkup = renderAccountCurrentRoute({
        loaderData: finalLoaderData,
      });

      expect(finalLoaderData.summary).toEqual({
        availableBalanceAmount: 0,
        owedAmount: 0,
        totalPaidAmount: 0,
      });
      expect(finalLoaderData.activeDepositInvoices).toEqual([]);
      expect(finalLoaderData.payments).toEqual([]);
      expect(finalMarkup).toContain("Movimientos");
      expect(finalMarkup).toContain("Pago N° 1 registrado");
      expect(finalMarkup).toContain("Factura de seña N° 1 emitida");
      expect(finalMarkup).toContain("Imputación anulada");
      expect(finalMarkup).toContain("Factura de seña N° 1 cancelada");
      expect(finalMarkup).toContain("Pago N° 1 anulado");
      expect(finalMarkup).toContain("Carga duplicada en conciliación.");
      expect(finalMarkup).toContain(
        "Factura emitida sobre una coreografía equivocada.",
      );
      expect(finalMarkup).toContain("Pago cargado en la academia equivocada.");
      expect(finalMarkup).not.toContain("Anular imputación");
      expect(finalMarkup).not.toContain("Cancelar factura");
      expect(finalMarkup).not.toContain("Anular pago");

      const { request: auditorCorrectionRequest } =
        await buildAnnulPaymentRequest({
          paymentId: payment.id,
          reason: "Un auditor no debería poder ejecutar esta acción.",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "auditor",
        });

      await expect(
        accountCurrentAction(
          detailActionArgs(auditorCorrectionRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 403,
      });
    });
  },
);

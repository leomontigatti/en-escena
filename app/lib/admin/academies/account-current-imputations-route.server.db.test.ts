import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
  prices,
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
  buildBalanceInvoiceIssueRequest,
  buildDepositInvoiceRequest,
  buildPaymentImputationRequest,
  buildPaymentRequest,
  createAcademyUser,
  createSavedEvent,
  detailActionArgs,
  detailRouteArgs,
  issueDepositInvoiceForTest,
  registerPaymentForTest,
  renderAccountCurrentRoute,
} from "./account-current-route.test-support";

installDatabaseTestHooks();

describe.sequential(
  "administracion academias cuenta corriente imputations",
  () => {
    test("imputes partial and full payment amounts to deposit invoices, updates balances, and derives invoice state", async () => {
      const event = await createSavedEvent({
        requiredDepositPercentage: 30,
      });
      const academy = await createAcademyUser({
        email: "academia.imputaciones.finanzas@example.com",
        academyName: "Academia Imputaciones",
      });
      const catalog = await createEventCatalog(event.id);
      const choreography = await createChoreographyRecord({
        academyId: academy.academy.id,
        categoryId: catalog.categoryWithLevel.id,
        createdAt: choreographyDate("2026-03-10T12:00:00Z"),
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        modalityId: catalog.modality.id,
        name: "Imputable",
        scheduleCapacityId: catalog.scheduleCapacity.id,
        submodalityId: catalog.submodality.id,
      });

      const { request: paymentRequest } = await buildPaymentRequest({
        amount: "5000",
        paymentDate: "2026-03-15",
        paymentMethod: "transferencia",
        requestUrl: accountCurrentUrl(academy.academy.id, event.id),
        role: "admin",
      });
      await expect(
        accountCurrentAction(
          detailActionArgs(paymentRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const { request: invoiceRequest } = await buildDepositInvoiceRequest({
        choreographyIds: [choreography.id],
        issueDate: "2026-03-20",
        requestUrl: accountCurrentUrl(academy.academy.id, event.id),
        role: "admin",
      });
      await expect(
        accountCurrentAction(
          detailActionArgs(invoiceRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
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
        throw new Error("Expected payment and invoice to exist.");
      }

      const { request: partialImputationRequest } =
        await buildPaymentImputationRequest({
          amount: "1000",
          imputationDate: "2026-03-20",
          invoiceId: invoice.id,
          paymentId: payment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });
      await expect(
        accountCurrentAction(
          detailActionArgs(partialImputationRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const partialLoaderData = await accountCurrentLoader(
        detailRouteArgs(
          new Request(accountCurrentUrl(academy.academy.id, event.id), {
            headers: {
              cookie:
                partialImputationRequest.headers.get("cookie") ??
                invoiceRequest.headers.get("cookie") ??
                paymentRequest.headers.get("cookie") ??
                "",
            },
          }),
          academy.academy.id,
        ),
      );
      const partialMarkup = renderAccountCurrentRoute({
        loaderData: partialLoaderData,
      });

      expect(partialLoaderData.summary).toEqual({
        availableBalanceAmount: 4000,
        owedAmount: 2000,
        totalPaidAmount: 5000,
      });
      expect(partialLoaderData.activeDepositInvoices).toMatchObject([
        {
          id: invoice.id,
          imputedAmount: 1000,
          pendingAmount: 2000,
          status: "parcial",
          choreographyFinancialState: "impaga",
        },
      ]);
      expect(partialLoaderData.payments).toMatchObject([
        {
          id: payment.id,
          availableAmount: 4000,
          imputedAmount: 1000,
        },
      ]);
      expect(partialMarkup).toContain("Parcial");
      expect(partialMarkup).toContain("Impaga");

      const { request: finalImputationRequest } =
        await buildPaymentImputationRequest({
          amount: "2000",
          imputationDate: "2026-03-21",
          invoiceId: invoice.id,
          paymentId: payment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });
      await expect(
        accountCurrentAction(
          detailActionArgs(finalImputationRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const imputations =
        await db.query.academyEventInvoiceImputations.findMany({
          where: eq(academyEventInvoiceImputations.invoiceId, invoice.id),
          orderBy: (table, { asc }) => [
            asc(table.imputationDate),
            asc(table.createdAt),
          ],
        });
      const refreshedInvoice =
        await db.query.academyEventChoreographyInvoices.findFirst({
          where: eq(academyEventChoreographyInvoices.id, invoice.id),
        });
      const paidLoaderData = await accountCurrentLoader(
        detailRouteArgs(
          new Request(accountCurrentUrl(academy.academy.id, event.id), {
            headers: {
              cookie:
                finalImputationRequest.headers.get("cookie") ??
                partialImputationRequest.headers.get("cookie") ??
                "",
            },
          }),
          academy.academy.id,
        ),
      );
      const paidMarkup = renderAccountCurrentRoute({
        loaderData: paidLoaderData,
      });

      expect(imputations.map((imputation) => imputation.amount)).toEqual([
        1000, 2000,
      ]);
      expect(refreshedInvoice).toMatchObject({
        depositCompletedOn: "2026-03-21",
      });
      expect(paidLoaderData.summary).toEqual({
        availableBalanceAmount: 2000,
        owedAmount: 0,
        totalPaidAmount: 5000,
      });
      expect(paidLoaderData.activeDepositInvoices).toMatchObject([
        {
          id: invoice.id,
          imputedAmount: 3000,
          pendingAmount: 0,
          status: "pagada",
          choreographyFinancialState: "señada",
        },
      ]);
      expect(paidLoaderData.payments).toMatchObject([
        {
          id: payment.id,
          availableAmount: 2000,
          imputedAmount: 3000,
        },
      ]);
      expect(paidMarkup).toContain("Pagada");
      expect(paidMarkup).toContain("Señada");
    });

    test("validates imputation dates, amount limits, and academy boundaries", async () => {
      const event = await createSavedEvent({
        requiredDepositPercentage: 30,
      });
      const academy = await createAcademyUser({
        email: "academia.imputaciones.validacion@example.com",
        academyName: "Academia Imputaciones Validacion",
      });
      const otherAcademy = await createAcademyUser({
        email: "academia.imputaciones.otra@example.com",
        academyName: "Academia Imputaciones Otra",
      });
      const catalog = await createEventCatalog(event.id);
      const choreography = await createChoreographyRecord({
        academyId: academy.academy.id,
        categoryId: catalog.categoryWithLevel.id,
        createdAt: choreographyDate("2026-03-10T12:00:00Z"),
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        modalityId: catalog.modality.id,
        name: "Validable",
        scheduleCapacityId: catalog.scheduleCapacity.id,
        submodalityId: catalog.submodality.id,
      });
      const otherChoreography = await createChoreographyRecord({
        academyId: otherAcademy.academy.id,
        categoryId: catalog.categoryWithLevel.id,
        createdAt: choreographyDate("2026-03-10T12:00:00Z"),
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        modalityId: catalog.modality.id,
        name: "Ajena",
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

      await registerPaymentForTest({
        academyId: otherAcademy.academy.id,
        amount: "3000",
        eventId: event.id,
        paymentDate: "2026-03-15",
      });
      await issueDepositInvoiceForTest({
        academyId: otherAcademy.academy.id,
        choreographyIds: [otherChoreography.id],
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
      const [otherPayment] = await db.query.academyEventPayments.findMany({
        where: eq(academyEventPayments.academyId, otherAcademy.academy.id),
      });
      const [otherInvoice] =
        await db.query.academyEventChoreographyInvoices.findMany({
          where: eq(
            academyEventChoreographyInvoices.choreographyId,
            otherChoreography.id,
          ),
        });

      if (!payment || !invoice || !otherPayment || !otherInvoice) {
        throw new Error("Expected payment and invoice fixtures to exist.");
      }

      const { request: invalidDateRequest } =
        await buildPaymentImputationRequest({
          amount: "1000",
          imputationDate: "2026-03-14",
          invoiceId: invoice.id,
          paymentId: payment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const invalidDateResult = await accountCurrentAction(
        detailActionArgs(invalidDateRequest, academy.academy.id),
      );
      expect(invalidDateResult).toMatchObject({
        status: "error",
        message: "Revisá los datos de la imputación.",
        fieldErrors: {
          imputationDate:
            "La fecha de imputación no puede ser anterior a la fecha del Pago.",
        },
      });

      const { request: overImputationRequest } =
        await buildPaymentImputationRequest({
          amount: "4000",
          imputationDate: "2026-03-20",
          invoiceId: invoice.id,
          paymentId: payment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const overImputationResult = await accountCurrentAction(
        detailActionArgs(overImputationRequest, academy.academy.id),
      );
      expect(overImputationResult).toMatchObject({
        status: "error",
        message: "Revisá los datos de la imputación.",
        fieldErrors: {
          amount:
            "La imputación no puede superar el saldo disponible del Pago ni el pendiente de la factura.",
        },
      });

      const { request: crossAcademyRequest } =
        await buildPaymentImputationRequest({
          amount: "1000",
          imputationDate: "2026-03-20",
          invoiceId: otherInvoice.id,
          paymentId: payment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const crossAcademyResult = await accountCurrentAction(
        detailActionArgs(crossAcademyRequest, academy.academy.id),
      );
      expect(crossAcademyResult).toMatchObject({
        status: "error",
        message: "Revisá los datos de la imputación.",
        fieldErrors: {
          paymentId: "Pago o factura inválidos para esta academia.",
        },
      });

      const { request: otherCrossAcademyRequest } =
        await buildPaymentImputationRequest({
          amount: "1000",
          imputationDate: "2026-03-20",
          invoiceId: invoice.id,
          paymentId: otherPayment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const otherCrossAcademyResult = await accountCurrentAction(
        detailActionArgs(otherCrossAcademyRequest, academy.academy.id),
      );
      expect(otherCrossAcademyResult).toMatchObject({
        status: "error",
        message: "Revisá los datos de la imputación.",
        fieldErrors: {
          paymentId: "Pago o factura inválidos para esta academia.",
        },
      });

      await expect(
        db.query.academyEventInvoiceImputations.findFirst({
          where: eq(academyEventInvoiceImputations.invoiceId, invoice.id),
        }),
      ).resolves.toBeUndefined();
    });

    test("blocks the imputation that would complete an outdated deposit invoice", async () => {
      const event = await createSavedEvent({
        requiredDepositPercentage: 30,
      });
      const academy = await createAcademyUser({
        email: "academia.imputaciones.desactualizada@example.com",
        academyName: "Academia Imputaciones Desactualizada",
      });
      const catalog = await createEventCatalog(event.id);
      const choreography = await createChoreographyRecord({
        academyId: academy.academy.id,
        categoryId: catalog.categoryWithLevel.id,
        createdAt: choreographyDate("2026-03-10T12:00:00Z"),
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        modalityId: catalog.modality.id,
        name: "Desactualizada",
        scheduleCapacityId: catalog.scheduleCapacity.id,
        submodalityId: catalog.submodality.id,
      });

      await registerPaymentForTest({
        academyId: academy.academy.id,
        amount: "5000",
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

      const { request: partialImputationRequest } =
        await buildPaymentImputationRequest({
          amount: "1000",
          imputationDate: "2026-03-20",
          invoiceId: invoice.id,
          paymentId: payment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });
      await expect(
        accountCurrentAction(
          detailActionArgs(partialImputationRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      await db.insert(prices).values({
        name: "Solo junio cronograma",
        eventId: event.id,
        groupType: "solo",
        amount: 12000,
        paymentDeadline: "2026-06-30",
        scheduleId: catalog.schedule.id,
      });

      const { request: staleCompletionRequest } =
        await buildPaymentImputationRequest({
          amount: "2000",
          imputationDate: "2026-06-10",
          invoiceId: invoice.id,
          paymentId: payment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const staleCompletionResult = await accountCurrentAction(
        detailActionArgs(staleCompletionRequest, academy.academy.id),
      );

      expect(staleCompletionResult).toMatchObject({
        status: "error",
        message: "Revisá los datos de la imputación.",
        fieldErrors: {
          invoiceId:
            "La seña quedó desactualizada con el precio vigente. Cancelala y emitila nuevamente antes de completarla.",
        },
      });
      await expect(
        db.query.academyEventInvoiceImputations.findMany({
          where: eq(academyEventInvoiceImputations.invoiceId, invoice.id),
        }),
      ).resolves.toHaveLength(1);
      await expect(
        db.query.academyEventChoreographyInvoices.findFirst({
          where: eq(academyEventChoreographyInvoices.id, invoice.id),
        }),
      ).resolves.toMatchObject({
        depositCompletedOn: null,
      });
    });

    test("marks a Coreografía pagada after fully imputing the active balance invoice", async () => {
      const event = await createSavedEvent({
        requiredDepositPercentage: 30,
      });
      const academy = await createAcademyUser({
        email: "academia.imputaciones.saldo@example.com",
        academyName: "Academia Imputaciones Saldo",
      });
      const catalog = await createEventCatalog(event.id);
      const choreography = await createChoreographyRecord({
        academyId: academy.academy.id,
        categoryId: catalog.categoryWithLevel.id,
        createdAt: choreographyDate("2026-03-10T12:00:00Z"),
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        modalityId: catalog.modality.id,
        name: "Pagada completa",
        scheduleCapacityId: catalog.scheduleCapacity.id,
        submodalityId: catalog.submodality.id,
      });

      await registerPaymentForTest({
        academyId: academy.academy.id,
        amount: "10000",
        eventId: event.id,
        paymentDate: "2026-03-15",
      });
      await issueDepositInvoiceForTest({
        academyId: academy.academy.id,
        choreographyIds: [choreography.id],
        eventId: event.id,
        issueDate: "2026-03-20",
      });

      const payment = await db.query.academyEventPayments.findFirst({
        where: eq(academyEventPayments.academyId, academy.academy.id),
      });
      const depositInvoice =
        await db.query.academyEventChoreographyInvoices.findFirst({
          where: eq(
            academyEventChoreographyInvoices.choreographyId,
            choreography.id,
          ),
        });

      if (!payment || !depositInvoice) {
        throw new Error("Expected deposit fixtures to exist.");
      }

      const { request: depositImputationRequest } =
        await buildPaymentImputationRequest({
          amount: String(depositInvoice.depositAmount),
          imputationDate: "2026-03-21",
          invoiceId: depositInvoice.id,
          paymentId: payment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      await expect(
        accountCurrentAction(
          detailActionArgs(depositImputationRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const { request: issueBalanceRequest } =
        await buildBalanceInvoiceIssueRequest({
          choreographyId: choreography.id,
          issueDate: "2026-03-25",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      await expect(
        accountCurrentAction(
          detailActionArgs(issueBalanceRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const balanceInvoice =
        await db.query.academyEventChoreographyInvoices.findFirst({
          where: and(
            eq(
              academyEventChoreographyInvoices.choreographyId,
              choreography.id,
            ),
            eq(academyEventChoreographyInvoices.invoiceType, "saldo"),
          ),
        });

      if (!balanceInvoice) {
        throw new Error("Expected balance invoice to exist.");
      }

      const { request: balanceImputationRequest } =
        await buildPaymentImputationRequest({
          amount: String(balanceInvoice.depositAmount),
          imputationDate: "2026-03-26",
          invoiceId: balanceInvoice.id,
          paymentId: payment.id,
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      await expect(
        accountCurrentAction(
          detailActionArgs(balanceImputationRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const loaderData = await accountCurrentLoader(
        detailRouteArgs(
          new Request(accountCurrentUrl(academy.academy.id, event.id), {
            headers: {
              cookie:
                balanceImputationRequest.headers.get("cookie") ??
                issueBalanceRequest.headers.get("cookie") ??
                "",
            },
          }),
          academy.academy.id,
        ),
      );

      expect(loaderData.activeBalanceInvoices).toMatchObject([
        {
          id: balanceInvoice.id,
          pendingAmount: 0,
          status: "pagada",
          choreographyFinancialState: "pagada",
        },
      ]);
      expect(loaderData.summary).toEqual({
        availableBalanceAmount: 0,
        owedAmount: 0,
        totalPaidAmount: 10000,
      });
    });
  },
);

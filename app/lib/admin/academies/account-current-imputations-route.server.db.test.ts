import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  prices,
} from "@/db/schema";
import { createEventCatalog } from "@/features/portal/choreographies/test-support/db";
import {
  action as accountCurrentAction,
  loader as accountCurrentLoader,
} from "@/routes/administracion.academias_.$academyId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  accountCurrentUrl,
  buildBalanceInvoiceIssueRequest,
  buildPaymentImputationRequest,
  createAccountCurrentInvoicePaymentFixture,
  createSavedEvent,
  detailActionArgs,
  detailRouteArgs,
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
      const { academy, invoice, payment } =
        await createAccountCurrentInvoicePaymentFixture({
          event,
          email: "academia.imputaciones.finanzas@example.com",
          academyName: "Academia Imputaciones",
          choreographyName: "Imputable",
          paymentAmount: "5000",
        });

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
              cookie: partialImputationRequest.headers.get("cookie") ?? "",
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
      const catalog = await createEventCatalog(event.id);
      const { academy, invoice, payment } =
        await createAccountCurrentInvoicePaymentFixture({
          event,
          catalog,
          email: "academia.imputaciones.validacion@example.com",
          academyName: "Academia Imputaciones Validacion",
          choreographyName: "Validable",
        });
      const { invoice: otherInvoice, payment: otherPayment } =
        await createAccountCurrentInvoicePaymentFixture({
          event,
          catalog,
          email: "academia.imputaciones.otra@example.com",
          academyName: "Academia Imputaciones Otra",
          choreographyName: "Ajena",
        });

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
      const { academy, catalog, invoice, payment } =
        await createAccountCurrentInvoicePaymentFixture({
          event,
          email: "academia.imputaciones.desactualizada@example.com",
          academyName: "Academia Imputaciones Desactualizada",
          choreographyName: "Desactualizada",
          paymentAmount: "5000",
        });

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
      const {
        academy,
        choreography,
        invoice: depositInvoice,
        payment,
      } = await createAccountCurrentInvoicePaymentFixture({
        event,
        email: "academia.imputaciones.saldo@example.com",
        academyName: "Academia Imputaciones Saldo",
        choreographyName: "Pagada completa",
        paymentAmount: "10000",
      });

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

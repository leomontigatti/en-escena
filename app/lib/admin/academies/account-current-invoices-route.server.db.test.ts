import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  academyEventPayments,
} from "@/db/schema";
import {
  action as accountCurrentAction,
  loader as accountCurrentLoader,
} from "@/routes/administracion.academias_.$academyId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  accountCurrentUrl,
  buildBalanceInvoiceIssueRequest,
  buildBalanceInvoicePreviewRequest,
  completeDepositInvoiceForTest,
  createAccountCurrentChoreographyFixture,
  buildPaymentRequest,
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
  "administracion academias cuenta corriente invoices",
  () => {
    test("previews and issues balance invoices with fixed snapshots", async () => {
      const event = await createSavedEvent({
        requiredDepositPercentage: 30,
      });
      const { academy, choreography } =
        await createAccountCurrentChoreographyFixture({
          email: "academia.facturas.saldo@example.com",
          academyName: "Academia Facturas Saldo",
          choreographyName: "Saldo final",
          event,
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
      await completeDepositInvoiceForTest({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        createdByUserId: academy.user.id,
        eventId: event.id,
      });

      const { request: previewRequest } =
        await buildBalanceInvoicePreviewRequest({
          administrativeDiscountAmount: "1200",
          administrativeDiscountInternalReason: "Excepción cierre académico",
          administrativeDiscountPublicLabel: "Beca academia",
          choreographyId: choreography.id,
          issueDate: "2026-03-25",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const previewResult = await accountCurrentAction(
        detailActionArgs(previewRequest, academy.academy.id),
      );

      expect(previewResult).toMatchObject({
        status: "preview",
        preview: {
          choreographyId: choreography.id,
          choreographyName: "Saldo final",
          issueDate: "2026-03-25",
          basePriceAmount: 10000,
          appliedDepositAmount: 3000,
          dancerDiscountAmount: 0,
          administrativeDiscountAmount: 1200,
          totalDiscountAmount: 1200,
          finalTotalAmount: 8800,
          balanceAmount: 5800,
          depositCompletedOn: "2026-03-21",
        },
      });

      const { request: issueRequest } = await buildBalanceInvoiceIssueRequest({
        administrativeDiscountAmount: "1200",
        administrativeDiscountInternalReason: "Excepción cierre académico",
        administrativeDiscountPublicLabel: "Beca academia",
        choreographyId: choreography.id,
        issueDate: "2026-03-25",
        requestUrl: accountCurrentUrl(academy.academy.id, event.id),
        role: "admin",
      });

      await expect(
        accountCurrentAction(
          detailActionArgs(issueRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const invoices = await db.query.academyEventChoreographyInvoices.findMany(
        {
          where: eq(
            academyEventChoreographyInvoices.choreographyId,
            choreography.id,
          ),
          orderBy: (table, { asc }) => [asc(table.invoiceNumber)],
        },
      );

      expect(invoices).toMatchObject([
        {
          invoiceNumber: 1,
          invoiceType: "sena",
          depositAmount: 3000,
        },
        {
          invoiceNumber: 2,
          invoiceType: "saldo",
          issueDate: "2026-03-25",
          basePriceAmount: 10000,
          depositAmount: 5800,
          depositCompletedOn: "2026-03-21",
          appliedDepositAmount: 3000,
          dancerDiscountAmount: 0,
          administrativeDiscountAmount: 1200,
          administrativeDiscountInternalReason: "Excepción cierre académico",
          administrativeDiscountPublicLabel: "Beca academia",
          totalDiscountAmount: 1200,
          finalTotalAmount: 8800,
        },
      ]);

      const loaderData = await accountCurrentLoader(
        detailRouteArgs(
          new Request(accountCurrentUrl(academy.academy.id, event.id), {
            headers: {
              cookie:
                issueRequest.headers.get("cookie") ??
                previewRequest.headers.get("cookie") ??
                "",
            },
          }),
          academy.academy.id,
        ),
      );
      const markup = renderAccountCurrentRoute({ loaderData });

      expect(loaderData.summary).toEqual({
        availableBalanceAmount: 7000,
        owedAmount: { status: "complete", amount: 0 },
        owedDepositAmount: { status: "complete", amount: 0 },
        totalPaidAmount: 10000,
      });
      expect(markup).toContain("Facturas de saldo activas");
      expect(markup).toContain("Beca academia");
      expect(markup).toContain("$ 5.800");
      expect(markup).toContain("$ 1.200");
    });

    test("blocks invalid balance issuance and keeps auditors read-only", async () => {
      const event = await createSavedEvent({
        requiredDepositPercentage: 30,
      });
      const { academy, choreography } =
        await createAccountCurrentChoreographyFixture({
          email: "academia.facturas.saldo.validacion@example.com",
          academyName: "Academia Facturas Saldo Validacion",
          choreographyName: "Saldo bloqueado",
          event,
        });

      const { request: noDepositPreviewRequest } =
        await buildBalanceInvoicePreviewRequest({
          choreographyId: choreography.id,
          issueDate: "2026-03-25",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const noDepositResult = await accountCurrentAction(
        detailActionArgs(noDepositPreviewRequest, academy.academy.id),
      );

      expect(noDepositResult).toMatchObject({
        status: "error",
        message: "Revisá los datos de la factura.",
        fieldErrors: {
          choreographyId:
            "La factura de saldo solo puede emitirse cuando la seña activa está totalmente pagada.",
        },
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

      const { request: missingReasonPreviewRequest } =
        await buildBalanceInvoicePreviewRequest({
          administrativeDiscountAmount: "500",
          choreographyId: choreography.id,
          issueDate: "2026-03-25",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const missingReasonResult = await accountCurrentAction(
        detailActionArgs(missingReasonPreviewRequest, academy.academy.id),
      );

      expect(missingReasonResult).toMatchObject({
        status: "error",
        fieldErrors: {
          administrativeDiscountInternalReason:
            "Ingresá el motivo interno del descuento administrativo.",
        },
      });

      await completeDepositInvoiceForTest({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        createdByUserId: academy.user.id,
        eventId: event.id,
      });

      const { request: negativeBalancePreviewRequest } =
        await buildBalanceInvoicePreviewRequest({
          administrativeDiscountAmount: "9000",
          administrativeDiscountInternalReason: "No válido",
          choreographyId: choreography.id,
          issueDate: "2026-03-25",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const negativeBalanceResult = await accountCurrentAction(
        detailActionArgs(negativeBalancePreviewRequest, academy.academy.id),
      );

      expect(negativeBalanceResult).toMatchObject({
        status: "error",
        fieldErrors: {
          administrativeDiscountAmount:
            "El descuento administrativo no puede dejar negativo el importe de saldo.",
        },
      });

      const { request: issueRequest } = await buildBalanceInvoiceIssueRequest({
        administrativeDiscountAmount: "500",
        administrativeDiscountInternalReason: "Excepción",
        choreographyId: choreography.id,
        issueDate: "2026-03-25",
        requestUrl: accountCurrentUrl(academy.academy.id, event.id),
        role: "admin",
      });

      await expect(
        accountCurrentAction(
          detailActionArgs(issueRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const { request: duplicateIssueRequest } =
        await buildBalanceInvoiceIssueRequest({
          administrativeDiscountAmount: "500",
          administrativeDiscountInternalReason: "Excepción",
          choreographyId: choreography.id,
          issueDate: "2026-03-26",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const duplicateResult = await accountCurrentAction(
        detailActionArgs(duplicateIssueRequest, academy.academy.id),
      );

      expect(duplicateResult).toMatchObject({
        status: "error",
        fieldErrors: {
          choreographyId:
            "Ya existe una factura de saldo activa para esta Coreografía.",
        },
      });

      const { request: auditorRequest } = await createSignedInRequest({
        email: "auditor.facturas.saldo@example.com",
        role: "auditor",
        requestUrl: accountCurrentUrl(academy.academy.id, event.id),
      });
      const loaderData = await accountCurrentLoader(
        detailRouteArgs(auditorRequest, academy.academy.id),
      );
      const markup = renderAccountCurrentRoute({ loaderData });

      expect(markup).toContain("Facturas de saldo activas");
      expect(markup).not.toContain("Emitir factura de saldo");
    });

    test("rejects invalid calendar payment dates", async () => {
      const event = await createSavedEvent();
      const academy = await createAcademyUser({
        email: "academia.fecha-invalida.finanzas@example.com",
        academyName: "Academia Fecha Invalida",
      });
      const { request } = await buildPaymentRequest({
        amount: "25000",
        paymentDate: "2026-02-31",
        paymentMethod: "transferencia",
        requestUrl: accountCurrentUrl(academy.academy.id, event.id),
        role: "admin",
      });

      const actionData = await accountCurrentAction(
        detailActionArgs(request, academy.academy.id),
      );

      expect(actionData).toMatchObject({
        status: "error",
        message: "Revisá los datos del pago.",
        fieldErrors: {
          paymentDate: "Ingresá una fecha válida.",
        },
      });
      await expect(
        db.query.academyEventPayments.findFirst({
          where: eq(academyEventPayments.academyId, academy.academy.id),
        }),
      ).resolves.toBeUndefined();
    });
  },
);

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
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
  buildDepositInvoiceRequest,
  buildPaymentRequest,
  createAcademyUser,
  createSavedEvent,
  createSignedInRequest,
  detailActionArgs,
  detailRouteArgs,
  renderAccountCurrentRoute,
} from "./account-current-route.test-support";

installDatabaseTestHooks();

describe.sequential(
  "administracion academias cuenta corriente invoices",
  () => {
    test("issues deposit invoices individually and in batch without auto-imputing available balance", async () => {
      const event = await createSavedEvent({
        requiredDepositPercentage: 35,
      });
      const academy = await createAcademyUser({
        email: "academia.facturas.finanzas@example.com",
        academyName: "Academia Facturas",
      });
      const catalog = await createEventCatalog(event.id);
      const firstChoreography = await createChoreographyRecord({
        academyId: academy.academy.id,
        categoryId: catalog.categoryWithLevel.id,
        createdAt: choreographyDate("2026-03-10T12:00:00Z"),
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        modalityId: catalog.modality.id,
        name: "Primera",
        scheduleCapacityId: catalog.scheduleCapacity.id,
        submodalityId: catalog.submodality.id,
      });
      const secondChoreography = await createChoreographyRecord({
        academyId: academy.academy.id,
        categoryId: catalog.categoryWithLevel.id,
        createdAt: choreographyDate("2026-03-12T12:00:00Z"),
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        modalityId: catalog.modality.id,
        name: "Segunda",
        scheduleCapacityId: catalog.scheduleCapacity.id,
        submodalityId: catalog.submodality.id,
      });

      const { request: paymentRequest } = await buildPaymentRequest({
        amount: "12000",
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

      const { request: firstInvoiceRequest } = await buildDepositInvoiceRequest(
        {
          choreographyIds: [firstChoreography.id],
          issueDate: "2026-03-20",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        },
      );

      await expect(
        accountCurrentAction(
          detailActionArgs(firstInvoiceRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const { request: batchInvoiceRequest } = await buildDepositInvoiceRequest(
        {
          choreographyIds: [secondChoreography.id],
          issueDate: "2026-03-21",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        },
      );

      await expect(
        accountCurrentAction(
          detailActionArgs(batchInvoiceRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const invoices = await db.query.academyEventChoreographyInvoices.findMany(
        {
          where: eq(
            academyEventChoreographyInvoices.academyId,
            academy.academy.id,
          ),
          orderBy: (table, { asc }) => [asc(table.invoiceNumber)],
        },
      );
      const loaderData = await accountCurrentLoader(
        detailRouteArgs(
          new Request(accountCurrentUrl(academy.academy.id, event.id), {
            headers: {
              cookie:
                batchInvoiceRequest.headers.get("cookie") ??
                firstInvoiceRequest.headers.get("cookie") ??
                paymentRequest.headers.get("cookie") ??
                "",
            },
          }),
          academy.academy.id,
        ),
      );
      const markup = renderAccountCurrentRoute({
        loaderData,
      });

      expect(invoices).toMatchObject([
        {
          choreographyId: firstChoreography.id,
          invoiceNumber: 1,
          invoiceType: "sena",
          issueDate: "2026-03-20",
          basePriceAmount: 10000,
          selectedPaymentDeadline: "2026-05-31",
          requiredDepositPercentageSnapshot: 35,
          depositAmount: 3500,
        },
        {
          choreographyId: secondChoreography.id,
          invoiceNumber: 2,
          invoiceType: "sena",
          issueDate: "2026-03-21",
          basePriceAmount: 10000,
          selectedPaymentDeadline: "2026-05-31",
          requiredDepositPercentageSnapshot: 35,
          depositAmount: 3500,
        },
      ]);
      expect(loaderData.summary).toEqual({
        availableBalanceAmount: 12000,
        owedAmount: 7000,
        totalPaidAmount: 12000,
      });
      expect(markup).toContain("Facturas de seña activas");
      expect(markup).toContain("Primera");
      expect(markup).toContain("Segunda");
      expect(markup).toContain("N° 1");
      expect(markup).toContain("N° 2");
      expect(markup).toContain("$ 3.500");
    });

    test("validates deposit invoice dates, blocks duplicate active invoices, and keeps auditors read-only", async () => {
      const event = await createSavedEvent({
        requiredDepositPercentage: 30,
      });
      const academy = await createAcademyUser({
        email: "academia.facturas.validacion@example.com",
        academyName: "Academia Facturas Validacion",
      });
      const catalog = await createEventCatalog(event.id);
      const choreography = await createChoreographyRecord({
        academyId: academy.academy.id,
        categoryId: catalog.categoryWithLevel.id,
        createdAt: choreographyDate("2026-03-10T12:00:00Z"),
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        modalityId: catalog.modality.id,
        name: "Unica",
        scheduleCapacityId: catalog.scheduleCapacity.id,
        submodalityId: catalog.submodality.id,
      });

      const { request: invalidDateRequest } = await buildDepositInvoiceRequest({
        choreographyIds: [choreography.id],
        issueDate: "2026-03-09",
        requestUrl: accountCurrentUrl(academy.academy.id, event.id),
        role: "admin",
      });

      const invalidDateResult = await accountCurrentAction(
        detailActionArgs(invalidDateRequest, academy.academy.id),
      );

      expect(invalidDateResult).toMatchObject({
        status: "error",
        message: "Revisá los datos de la factura.",
        fieldErrors: {
          issueDate:
            "La fecha de emisión no puede ser anterior a la creación de la Coreografía más reciente seleccionada.",
        },
      });

      const { request: createInvoiceRequest } =
        await buildDepositInvoiceRequest({
          choreographyIds: [choreography.id],
          issueDate: "2026-03-20",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      await expect(
        accountCurrentAction(
          detailActionArgs(createInvoiceRequest, academy.academy.id),
        ),
      ).rejects.toMatchObject({
        status: 302,
      });

      const { request: duplicateInvoiceRequest } =
        await buildDepositInvoiceRequest({
          choreographyIds: [choreography.id],
          issueDate: "2026-03-21",
          requestUrl: accountCurrentUrl(academy.academy.id, event.id),
          role: "admin",
        });

      const duplicateResult = await accountCurrentAction(
        detailActionArgs(duplicateInvoiceRequest, academy.academy.id),
      );

      expect(duplicateResult).toMatchObject({
        status: "error",
        message:
          "Ya existe una factura de seña activa para alguna de las Coreografías seleccionadas.",
      });

      const { request: auditorRequest } = await createSignedInRequest({
        email: "auditor.facturas@example.com",
        role: "auditor",
        requestUrl: accountCurrentUrl(academy.academy.id, event.id),
      });
      const loaderData = await accountCurrentLoader(
        detailRouteArgs(auditorRequest, academy.academy.id),
      );
      const markup = renderAccountCurrentRoute({ loaderData });

      expect(markup).toContain("Facturas de seña activas");
      expect(markup).toContain("Unica");
      expect(markup).not.toContain("Emitir factura de seña");
      expect(loaderData.canRegisterPayments).toBe(false);
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

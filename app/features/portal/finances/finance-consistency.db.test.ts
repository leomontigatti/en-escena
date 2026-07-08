import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  choreographyDancers,
  prices,
} from "@/db/schema";
import { loadAdministrativeChoreographyFinanceDetail } from "@/features/admin/academies/account-current/choreography-detail/server";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  date as choreographyDate,
} from "@/features/portal/choreographies/test-support/db";
import { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import { createAcademySession } from "@/features/portal/test-support/db";
import { activateEvent } from "@/lib/events/management.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { loader as accountCurrentLoader } from "@/routes/administracion.academias_.$academyId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  accountCurrentUrl,
  completeDepositInvoiceForTest,
  createSavedEvent,
  createSignedInRequest,
  detailRouteArgs,
  issueDepositInvoiceForTest,
  registerPaymentForTest,
} from "../../../lib/admin/academies/account-current-route.test-support";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

describe.sequential(
  "finance consistency across admin and portal surfaces",
  () => {
    test("keeps summaries, row amounts, and choreography details consistent across mixed choreography states", async () => {
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

      for (const choreography of [
        currentPriceChoreography,
        pendingSnapshotChoreography,
        paidSnapshotChoreography,
        missingPriceChoreography,
      ]) {
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

      const currentPriceDetail = await loadChoreographyFinanceDetail({
        academyId: owner.academyId,
        choreographyId: currentPriceChoreography.id,
        email: "admin.detalle.actual@example.com",
        eventId: event.id,
      });
      const pendingSnapshotDetail = await loadChoreographyFinanceDetail({
        academyId: owner.academyId,
        choreographyId: pendingSnapshotChoreography.id,
        email: "admin.detalle.pendiente@example.com",
        eventId: event.id,
      });
      const paidSnapshotDetail = await loadChoreographyFinanceDetail({
        academyId: owner.academyId,
        choreographyId: paidSnapshotChoreography.id,
        email: "admin.detalle.pagada@example.com",
        eventId: event.id,
      });
      const missingPriceDetail = await loadChoreographyFinanceDetail({
        academyId: owner.academyId,
        choreographyId: missingPriceChoreography.id,
        email: "admin.detalle.sin.precio@example.com",
        eventId: event.id,
      });

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
  },
);

async function loadChoreographyFinanceDetail(input: {
  academyId: string;
  choreographyId: string;
  email: string;
  eventId: string;
}) {
  const { request } = await createSignedInRequest({
    email: input.email,
    role: "admin",
    requestUrl: choreographyFinanceDetailUrl({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      eventId: input.eventId,
    }),
  });

  return await loadAdministrativeChoreographyFinanceDetail(
    choreographyDetailRouteArgs({
      academyId: input.academyId,
      choreographyId: input.choreographyId,
      request,
    }),
  );
}

function choreographyFinanceDetailUrl(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}) {
  return `http://localhost/administracion/finanzas/${input.academyId}/coreografias/${input.choreographyId}?evento=${input.eventId}`;
}

function choreographyDetailRouteArgs(input: {
  academyId: string;
  choreographyId: string;
  request: Request;
}) {
  return {
    context: {},
    params: {
      academyId: input.academyId,
      choreographyId: input.choreographyId,
    },
    pattern: "/administracion/finanzas/:academyId/coreografias/:choreographyId",
    request: input.request,
    url: new URL(input.request.url),
  };
}

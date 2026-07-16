import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  payments,
  choreographyDancers,
  paymentAllocations,
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
  createSavedEvent,
  createSignedInRequest,
  detailRouteArgs,
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

      async function createSoloChoreography(name: string, createdAt: string) {
        return await createChoreographyRecord({
          academyId: owner.academyId,
          categoryId: catalog.categoryWithLevel.id,
          createdAt: choreographyDate(createdAt),
          eventId: event.id,
          experienceLevelId: catalog.level.id,
          modalityId: catalog.modality.id,
          name,
          scheduleCapacityId: catalog.scheduleCapacity.id,
          submodalityId: catalog.submodality.id,
        });
      }

      const currentPriceChoreography = await createSoloChoreography(
        "Solo actual",
        "2026-03-10T12:00:00Z",
      );
      const pendingSnapshotChoreography = await createSoloChoreography(
        "Solo seña pendiente",
        "2026-03-11T12:00:00Z",
      );
      const paidSnapshotChoreography = await createSoloChoreography(
        "Solo seña pagada",
        "2026-03-12T12:00:00Z",
      );
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

      const [payment] = await db
        .insert(payments)
        .values({
          academyId: owner.academyId,
          amount: 16600,
          eventId: event.id,
          paymentDate: "2026-03-21",
          paymentMethod: "transferencia",
          paymentNumber: 1,
        })
        .returning();

      // currentPrice: impaga at the current tentative price.
      await insertImpagaInscription(
        currentPriceChoreography.id,
        owner.academyId,
      );
      // missingPrice: impaga with no applicable duo price.
      await insertImpagaInscription(
        missingPriceChoreography.id,
        owner.academyId,
      );

      // pendingSnapshot: señada with a deposit allocation.
      const pendingInscription = await insertSignedInscription({
        academyId: owner.academyId,
        choreographyId: pendingSnapshotChoreography.id,
        depositAmount: 3600,
        frozenBasePriceAmount: 12000,
      });
      await db.insert(paymentAllocations).values({
        academyId: owner.academyId,
        allocationType: "deposit",
        amount: 3600,
        eventId: event.id,
        inscriptionId: pendingInscription.id,
        paymentId: payment.id,
      });

      // paidSnapshot: pagada with deposit + balance allocations.
      const paidInscription = await insertSignedInscription({
        academyId: owner.academyId,
        choreographyId: paidSnapshotChoreography.id,
        depositAmount: 3600,
        frozenBasePriceAmount: 12000,
        paid: { balanceAmount: 8400, finalTotalAmount: 12000 },
      });
      await db.insert(paymentAllocations).values([
        {
          academyId: owner.academyId,
          allocationType: "deposit",
          amount: 3600,
          eventId: event.id,
          inscriptionId: paidInscription.id,
          paymentId: payment.id,
        },
        {
          academyId: owner.academyId,
          allocationType: "balance",
          amount: 8400,
          eventId: event.id,
          inscriptionId: paidInscription.id,
          paymentId: payment.id,
        },
      ]);

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
        // 16600 pagos - 15600 asignaciones = 1000 disponible.
        availableBalanceAmount: 1000,
        // 3000 seña impaga + 8400 saldo señada - 1000 disponible = 10400.
        owedAmount: {
          amount: 10400,
          missingPriceCount: 1,
          status: "incomplete",
        },
        // 3000 seña impaga (currentPrice); missing price adds 1.
        owedDepositAmount: {
          amount: 3000,
          missingPriceCount: 1,
          status: "incomplete",
        },
        totalPaidAmount: 16600,
      });
      expect(adminLoaderData.summary).toEqual(portalLoaderData.summary);
      expect(adminLoaderData.choreographyFinanceRows).toMatchObject([
        {
          id: missingPriceChoreography.id,
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
          owedAmount: { amount: 3000, status: "complete" },
          owedDepositAmount: { amount: 3000, status: "complete" },
        },
        {
          id: paidSnapshotChoreography.id,
          basePriceAmount: { amount: 12000, status: "complete" },
          financialState: "pagada",
          owedAmount: { amount: 0, status: "complete" },
          owedDepositAmount: { amount: 0, status: "complete" },
        },
        {
          id: pendingSnapshotChoreography.id,
          basePriceAmount: { amount: 12000, status: "complete" },
          financialState: "señada",
          owedAmount: { amount: 8400, status: "complete" },
          owedDepositAmount: { amount: 0, status: "complete" },
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
        owedAmount: { amount: 3000, status: "complete" },
        paidAmount: 0,
      });
      expect(currentPriceDetail.inscriptions).toEqual([
        expect.objectContaining({
          basePriceAmount: 10000,
          finalPriceAmount: 10000,
        }),
      ]);
      expect(pendingSnapshotDetail.choreography).toMatchObject({
        depositAmount: { amount: 3600, status: "complete" },
        depositCompletedOn: "2026-03-20",
        owedAmount: { amount: 8400, status: "complete" },
        paidAmount: 3600,
      });
      expect(pendingSnapshotDetail.inscriptions).toEqual([
        expect.objectContaining({
          basePriceAmount: 12000,
          finalPriceAmount: 12000,
        }),
      ]);
      expect(paidSnapshotDetail.choreography).toMatchObject({
        depositAmount: { amount: 3600, status: "complete" },
        depositCompletedOn: "2026-03-20",
        owedAmount: { amount: 0, status: "complete" },
        paidAmount: 12000,
      });
      expect(paidSnapshotDetail.inscriptions).toEqual([
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
      expect(missingPriceDetail.inscriptions).toEqual([
        expect.objectContaining({
          basePriceAmount: null,
          finalPriceAmount: null,
        }),
      ]);
    });
  },
);

async function insertImpagaInscription(
  choreographyId: string,
  academyId: string,
) {
  const dancer = await createDancer(academyId, {
    firstName: "Ana",
    lastName: choreographyId,
  });

  await db.insert(choreographyDancers).values({
    ageAtEventStart: 14,
    choreographyId,
    dancerId: dancer.id,
  });
}

async function insertSignedInscription(input: {
  academyId: string;
  choreographyId: string;
  depositAmount: number;
  frozenBasePriceAmount: number;
  paid?: { finalTotalAmount: number; balanceAmount: number };
}) {
  const dancer = await createDancer(input.academyId, {
    firstName: "Luna",
    lastName: input.choreographyId,
  });

  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: input.choreographyId,
      dancerId: dancer.id,
      frozenBasePriceAmount: input.frozenBasePriceAmount,
      depositReferenceDate: "2026-03-20",
      depositPercentage: 30,
      depositAmount: input.depositAmount,
      ...(input.paid
        ? {
            balanceReferenceDate: "2026-03-23",
            appliedDancerDiscountPercentage: 0,
            appliedDancerDiscountAmount: 0,
            finalTotalAmount: input.paid.finalTotalAmount,
            balanceAmount: input.paid.balanceAmount,
            balanceCompletedAt: "2026-03-23",
          }
        : {}),
    })
    .returning();

  return inscription;
}

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

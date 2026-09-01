import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  payments,
  choreographyDancers,
  paymentAllocations,
  prices,
} from "@/db/schema";
import { loadChoreographyFinanceDetail } from "@/features/admin/finances/academy-choreographies/choreography-detail/server";
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
import { loader as academyFinancesLoader } from "@/routes/administracion.finanzas_.$academyId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  academyFinancesUrl,
  createSavedEvent,
  createSignedInRequest,
  academyFinancesRouteArgs,
} from "../../../lib/admin/finances/finances.test-support";

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
      // The earlier, more expensive row: the already collected inscriptions have
      // it selected, so their figures come from it and not from the current one.
      const [earlierPrice] = await db
        .insert(prices)
        .values({
          amount: 12000,
          eventId: event.id,
          groupType: "solo",
          name: "Precio solo anterior",
          paymentDeadline: "2026-02-28",
          scheduleId: catalog.schedule.id,
        })
        .returning();

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
        selectedPriceId: earlierPrice.id,
      });
      await db.insert(paymentAllocations).values({
        academyId: owner.academyId,
        amount: 3600,
        eventId: event.id,
        inscriptionId: pendingInscription.id,
        paymentId: payment.id,
      });

      // paidSnapshot: paid, with the deposit and the balance in a single
      // allocation.
      const paidInscription = await insertSignedInscription({
        academyId: owner.academyId,
        choreographyId: paidSnapshotChoreography.id,
        selectedPriceId: earlierPrice.id,
      });
      await db.insert(paymentAllocations).values({
        academyId: owner.academyId,
        amount: 12000,
        eventId: event.id,
        inscriptionId: paidInscription.id,
        paymentId: payment.id,
      });

      const portalLoaderData = await loadPortalAcademyFinances(
        new Request("http://localhost/portal/finanzas", {
          headers: { cookie: owner.cookie },
        }),
      );
      const { request: adminRequest } = await createSignedInRequest({
        email: "admin.portal.consistencia@example.com",
        role: "admin",
        requestUrl: academyFinancesUrl(owner.academyId, event.id),
      });
      const adminLoaderData = await academyFinancesLoader(
        academyFinancesRouteArgs(adminRequest, owner.academyId),
      );

      expect(portalLoaderData.summary).toEqual({
        // 16600 pagos - 15600 asignaciones = 1000 disponible.
        availableBalanceAmount: 1000,
        // The thresholds of the three that have a price (3000 + 3600 + 3600 of
        // deposit, 10000 + 12000 + 12000 of total); the one with no price adds 1
        // to the incomplete count.
        depositAmount: {
          amount: 10200,
          missingPriceCount: 1,
          status: "incomplete",
        },
        totalAmount: {
          amount: 34000,
          missingPriceCount: 1,
          status: "incomplete",
        },
        // 8400 of shortfall on the one that covered its deposit + 10000 from the
        // one with nothing, at the current price; the one with no price adds 1 to
        // the incomplete count. Gross: it does not subtract the available balance.
        owedBalanceAmount: {
          amount: 18400,
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
          financialStatus: "depositPending",
          totalAmount: {
            amount: 0,
            missingPriceCount: 1,
            status: "incomplete",
          },
          owedBalanceAmount: {
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
          financialStatus: "depositPending",
          // With no money it owes its deposit and its total: the two cuts of the
          // same debt.
          owedBalanceAmount: { amount: 10000, status: "complete" },
          owedDepositAmount: { amount: 3000, status: "complete" },
          totalAmount: { amount: 10000, status: "complete" },
        },
        {
          id: paidSnapshotChoreography.id,
          basePriceAmount: { amount: 12000, status: "complete" },
          financialStatus: "paidInFull",
          owedBalanceAmount: { amount: 0, status: "complete" },
          owedDepositAmount: { amount: 0, status: "complete" },
          totalAmount: { amount: 12000, status: "complete" },
        },
        {
          id: pendingSnapshotChoreography.id,
          basePriceAmount: { amount: 12000, status: "complete" },
          financialStatus: "depositMet",
          owedBalanceAmount: { amount: 8400, status: "complete" },
          owedDepositAmount: { amount: 0, status: "complete" },
          totalAmount: { amount: 12000, status: "complete" },
        },
      ]);

      const currentPriceDetail = await loadChoreographyFinanceDetailAsAdmin({
        academyId: owner.academyId,
        choreographyId: currentPriceChoreography.id,
        email: "admin.detalle.actual@example.com",
        eventId: event.id,
      });
      const pendingSnapshotDetail = await loadChoreographyFinanceDetailAsAdmin({
        academyId: owner.academyId,
        choreographyId: pendingSnapshotChoreography.id,
        email: "admin.detalle.pendiente@example.com",
        eventId: event.id,
      });
      const paidSnapshotDetail = await loadChoreographyFinanceDetailAsAdmin({
        academyId: owner.academyId,
        choreographyId: paidSnapshotChoreography.id,
        email: "admin.detalle.pagada@example.com",
        eventId: event.id,
      });
      const missingPriceDetail = await loadChoreographyFinanceDetailAsAdmin({
        academyId: owner.academyId,
        choreographyId: missingPriceChoreography.id,
        email: "admin.detalle.sin.precio@example.com",
        eventId: event.id,
      });

      expect(currentPriceDetail.choreography).toMatchObject({
        allocatedAmount: 0,
        depositAmount: { amount: 3000, status: "complete" },
        owedBalanceAmount: { amount: 10000, status: "complete" },
        totalAmount: { amount: 10000, status: "complete" },
      });
      expect(currentPriceDetail.inscriptions).toEqual([
        expect.objectContaining({
          basePriceAmount: 10000,
          totalAmount: 10000,
        }),
      ]);
      expect(pendingSnapshotDetail.choreography).toMatchObject({
        allocatedAmount: 3600,
        depositAmount: { amount: 3600, status: "complete" },
        owedBalanceAmount: { amount: 8400, status: "complete" },
        totalAmount: { amount: 12000, status: "complete" },
      });
      expect(pendingSnapshotDetail.inscriptions).toEqual([
        expect.objectContaining({
          basePriceAmount: 12000,
          totalAmount: 12000,
        }),
      ]);
      expect(paidSnapshotDetail.choreography).toMatchObject({
        allocatedAmount: 12000,
        depositAmount: { amount: 3600, status: "complete" },
        owedBalanceAmount: { amount: 0, status: "complete" },
        totalAmount: { amount: 12000, status: "complete" },
      });
      expect(paidSnapshotDetail.inscriptions).toEqual([
        expect.objectContaining({
          basePriceAmount: 12000,
          totalAmount: 12000,
        }),
      ]);
      expect(missingPriceDetail.choreography).toMatchObject({
        allocatedAmount: 0,
        depositAmount: {
          amount: 0,
          missingPriceCount: 1,
          status: "incomplete",
        },
        totalAmount: {
          amount: 0,
          missingPriceCount: 1,
          status: "incomplete",
        },
      });
      expect(missingPriceDetail.inscriptions).toEqual([
        expect.objectContaining({
          basePriceAmount: null,
          totalAmount: null,
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
  selectedPriceId?: string;
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
      selectedPriceId: input.selectedPriceId ?? null,
    })
    .returning();

  return inscription;
}

async function loadChoreographyFinanceDetailAsAdmin(input: {
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

  return await loadChoreographyFinanceDetail(
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

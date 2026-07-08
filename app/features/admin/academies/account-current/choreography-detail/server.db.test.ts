import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  choreographies,
  choreographyDancers,
  prices,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import * as businessTimeZone from "@/lib/shared/business-time-zone";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";
import {
  completeDepositInvoiceForTest,
  createAccountCurrentChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
  issueDepositInvoiceForTest,
  registerPaymentForTest,
} from "../../../../../lib/admin/academies/account-current-route.test-support";

import { loadAdministrativeChoreographyFinanceDetail } from "./server";

installDatabaseTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

describe.sequential("administracion finanzas coreografia detalle", () => {
  test("loads readonly finance detail with academy, choreography, deposit date, and participations", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Detalle",
        email: "academia.detalle.finanzas@example.com",
        choreographyName: "Detalle financiero",
        event,
      });
    const dancer = await createDancer(academy.academy.id, {
      firstName: "Ana",
      lastName: "López",
    });

    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
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
    await completeDepositInvoiceForTest({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      createdByUserId: academy.user.id,
      eventId: event.id,
    });

    const { request } = await createSignedInRequest({
      email: "admin.detalle.finanzas@example.com",
      role: "admin",
      requestUrl: choreographyFinanceDetailUrl({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        eventId: event.id,
      }),
    });

    const loaderData = await loadAdministrativeChoreographyFinanceDetail(
      detailRouteArgs({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        request,
      }),
    );

    expect(loaderData.academy.name).toBe("Academia Detalle");
    expect(loaderData.choreography).toMatchObject({
      depositCompletedOn: "2026-03-21",
      groupType: "solo",
      name: "Detalle financiero",
      paidAmount: 3000,
    });
    expect(loaderData.participations).toEqual([
      {
        basePriceAmount: 10000,
        dancerId: dancer.id,
        discountAmount: 0,
        finalPriceAmount: 10000,
        firstName: "Ana",
        lastName: "López",
      },
    ]);
  });

  test("shows incomplete finance amounts and Sin precio when the current Cordoba business date has no applicable price", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-01",
    );

    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Sin Precio",
        email: "academia.sin.precio.detalle@example.com",
        choreographyName: "Detalle sin precio",
        event,
      });
    const dancer = await createDancer(academy.academy.id, {
      firstName: "Mora",
      lastName: "Pérez",
    });

    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    });

    const { request } = await createSignedInRequest({
      email: "admin.sin.precio.detalle@example.com",
      role: "admin",
      requestUrl: choreographyFinanceDetailUrl({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        eventId: event.id,
      }),
    });

    const loaderData = await loadAdministrativeChoreographyFinanceDetail(
      detailRouteArgs({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        request,
      }),
    );

    expect(loaderData.choreography).toMatchObject({
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
    });
    expect(loaderData.participations).toEqual([
      {
        basePriceAmount: null,
        dancerId: dancer.id,
        discountAmount: 0,
        finalPriceAmount: null,
        firstName: "Mora",
        lastName: "Pérez",
      },
    ]);
  });

  test("calculates choreography balance from base price times inscription count", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-03-27",
    );

    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Duo",
        email: "academia.duo.detalle@example.com",
        choreographyName: "Detalle duo",
        event,
      });
    const firstDancer = await createDancer(academy.academy.id, {
      firstName: "Ana",
      lastName: "López",
    });
    const secondDancer = await createDancer(academy.academy.id, {
      firstName: "Bruno",
      lastName: "Ríos",
    });

    await db
      .update(choreographies)
      .set({ groupType: "duo" })
      .where(eq(choreographies.id, choreography.id));
    await db.insert(choreographyDancers).values([
      {
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: firstDancer.id,
      },
      {
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: secondDancer.id,
      },
    ]);
    await db.insert(prices).values({
      amount: 36000,
      eventId: event.id,
      groupType: "duo",
      name: "Precio Duo",
      paymentDeadline: "2026-05-31",
      scheduleId: null,
    });

    const { request } = await createSignedInRequest({
      email: "admin.duo.detalle@example.com",
      role: "admin",
      requestUrl: choreographyFinanceDetailUrl({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        eventId: event.id,
      }),
    });

    const loaderData = await loadAdministrativeChoreographyFinanceDetail(
      detailRouteArgs({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        request,
      }),
    );

    expect(loaderData.choreography).toMatchObject({
      depositAmount: { amount: 21600, status: "complete" },
      groupType: "duo",
      owedAmount: { amount: 72000, status: "complete" },
      paidAmount: 0,
    });
    expect(loaderData.participations).toEqual([
      {
        basePriceAmount: 36000,
        dancerId: firstDancer.id,
        discountAmount: 0,
        finalPriceAmount: 36000,
        firstName: "Ana",
        lastName: "López",
      },
      {
        basePriceAmount: 36000,
        dancerId: secondDancer.id,
        discountAmount: 0,
        finalPriceAmount: 36000,
        firstName: "Bruno",
        lastName: "Ríos",
      },
    ]);
  });

  test("uses the active pending seña snapshot for detail prices and owed amounts", async () => {
    vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
      "2026-06-01",
    );

    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Snapshot Detalle",
        email: "academia.snapshot.detalle@example.com",
        choreographyName: "Detalle snapshot",
        event,
      });
    const dancer = await createDancer(academy.academy.id, {
      firstName: "Luna",
      lastName: "García",
    });

    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    });
    await issueDepositInvoiceForTest({
      academyId: academy.academy.id,
      choreographyIds: [choreography.id],
      eventId: event.id,
      issueDate: "2026-03-20",
    });
    await db
      .update(academyEventChoreographyInvoices)
      .set({
        basePriceAmount: 12000,
        depositAmount: 3600,
      })
      .where(
        eq(academyEventChoreographyInvoices.choreographyId, choreography.id),
      );

    const { request } = await createSignedInRequest({
      email: "admin.snapshot.detalle@example.com",
      role: "admin",
      requestUrl: choreographyFinanceDetailUrl({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        eventId: event.id,
      }),
    });

    const loaderData = await loadAdministrativeChoreographyFinanceDetail(
      detailRouteArgs({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        request,
      }),
    );

    expect(loaderData.choreography).toMatchObject({
      depositAmount: { amount: 3600, status: "complete" },
      depositCompletedOn: null,
      owedAmount: { amount: 12000, status: "complete" },
    });
    expect(loaderData.participations).toEqual([
      {
        basePriceAmount: 12000,
        dancerId: dancer.id,
        discountAmount: 0,
        finalPriceAmount: 12000,
        firstName: "Luna",
        lastName: "García",
      },
    ]);
  });
});

function choreographyFinanceDetailUrl(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}) {
  return `http://localhost/administracion/finanzas/${input.academyId}/coreografias/${input.choreographyId}?evento=${input.eventId}`;
}

function detailRouteArgs(input: {
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

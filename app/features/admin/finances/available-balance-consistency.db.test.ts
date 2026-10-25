import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  payments,
  seminarInscriptions,
} from "@/db/schema";
import { loadChoreographyFinanceDetail } from "@/features/admin/finances/academy-choreographies/choreography-detail/server";
import { loadSeminarFinanceDetail } from "@/features/admin/finances/academy-seminars/seminar-detail/server";
import { loadPaymentDetail } from "@/features/admin/payments/detail/server";
import { loadIndividualFinances } from "@/features/individual/finances/server";
import { individualFinancesPath } from "@/features/individual/finances/shared";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import {
  academyFinancesRouteArgs,
  academyFinancesUrl,
  createAcademyFinanceChoreographyFixture,
  financesListRouteArgs,
  financesListUrl,
  registerPaymentForTest,
} from "@/lib/admin/finances/finances.test-support";
import { spreadFromPool } from "@/lib/finances/allocation-pool.server";
import { choreographyTarget } from "@/lib/finances/allocation-target.server";
import {
  allocateToSeminarInscription,
  readSeminarInscriptionPriceOptions,
} from "@/lib/finances/seminar-inscription-allocation.server";
import { createSeminarRegistrationPrices } from "@/lib/seminar-prices/seminar-prices.test-support";
import { createSeminar } from "@/lib/seminars/repository.server";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";
import { createIndividualUser } from "@/lib/test-support/individuals";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";
import { loader as financesListLoader } from "@/routes/administracion.finanzas";
import { loader as academyFinancesLoader } from "@/routes/administracion.finanzas_.$academyId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

type SavedEvent = Awaited<ReturnType<typeof createSavedEvent>>;

/**
 * An academy with three payments and part of them funded onto a choreography
 * inscription through the pool: payment 1 spent, payment 2 partly drawn and
 * payment 3 untouched.
 */
async function seedAcademy(event: SavedEvent) {
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Saldo",
      choreographyName: "Solo saldo",
      email: `${crypto.randomUUID()}@example.com`,
      event,
    });
  const academyId = academy.academy.id;
  const dancer = await createDancer(academyId, {
    firstName: "Ana",
    lastName: "Alonso",
  });
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();

  for (const [index, amount] of [1000, 2000, 3000].entries()) {
    await registerPaymentForTest({
      academyId,
      amount: String(amount),
      eventId: event.id,
      paymentDate: `2026-04-0${index + 1}`,
    });
  }

  const funded = await db.transaction((tx) =>
    spreadFromPool(tx, {
      academyId,
      amount: 2500,
      eventId: event.id,
      target: choreographyTarget(inscription!.id),
    }),
  );
  expect(funded).toEqual({ ok: true });

  return { academyId, choreographyId: choreography.id, cookie: academy.cookie };
}

/**
 * A `Particular` with two payments and a seminar's deposit funded from them.
 */
async function seedIndividual(event: SavedEvent) {
  await createSeminarRegistrationPrices(event.id);
  const created = await createSeminar(event.id, {
    instructorName: "Abril Sosa",
    quota: 5,
    scheduledDate: "2030-10-10",
    startTime: "18:30",
    ...defaultSeminarFacts,
  });

  if (!created.ok) {
    throw new Error(created.error);
  }

  const individual = await createIndividualUser({
    email: `${crypto.randomUUID()}@example.com`,
    firstName: "Clara",
    lastName: "Ríos",
  });
  const [inscription] = await db
    .insert(seminarInscriptions)
    .values({
      individualId: individual.individualId,
      seminarId: created.seminar.id,
    })
    .returning();

  for (const [index, amount] of [8000, 9000].entries()) {
    await registerPaymentForTest({
      academyId: individual.ownerId,
      amount: String(amount),
      eventId: event.id,
      paymentDate: `2026-04-0${index + 4}`,
    });
  }

  const options = await readSeminarInscriptionPriceOptions({
    eventId: event.id,
    seminarId: created.seminar.id,
  });
  const [price] = options.get(inscription!.id) ?? [];
  const allocated = await allocateToSeminarInscription({
    academyId: individual.ownerId,
    amount: price!.depositAmount,
    eventId: event.id,
    inscriptionId: inscription!.id,
    priceId: price!.id,
    seminarId: created.seminar.id,
  });
  expect(allocated).toEqual({ ok: true });

  return {
    cookie: individual.cookie,
    depositAmount: price!.depositAmount,
    ownerId: individual.ownerId,
    seminarId: created.seminar.id,
  };
}

async function adminRequest(url: string) {
  const { request } = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl: url,
  });

  return request;
}

/** Each payment's `Disponible` as its detail page reads it. */
async function readPaymentsAvailable(academyId: string, eventId: string) {
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.academyId, academyId))
    .orderBy(asc(payments.paymentNumber));
  const available: number[] = [];

  for (const row of rows) {
    const detail = await loadPaymentDetail(
      await adminRequest(
        `http://localhost/administracion/pagos/${row.id}?evento=${eventId}`,
      ),
      row.id,
    );
    available.push(detail.availableAmount);
  }

  return available;
}

describe("`Saldo disponible` across surfaces", () => {
  test("every surface reads the owner's one figure, and its payments' `Disponible` sum to it", async () => {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const academy = await seedAcademy(event);
    const individual = await seedIndividual(event);
    // 6000 paid − 2500 funded; 17000 paid − the seminar's deposit.
    const academyBalance = 3500;
    const individualBalance = 17000 - individual.depositAmount;

    const financesList = await financesListLoader(
      financesListRouteArgs(await adminRequest(financesListUrl(event.id))),
    );
    const listBalance = (academyId: string) =>
      financesList.rows.find((row) => row.academyId === academyId)
        ?.availableBalanceAmount;

    const ownerPage = async (academyId: string) =>
      (
        await academyFinancesLoader(
          academyFinancesRouteArgs(
            await adminRequest(academyFinancesUrl(academyId, event.id)),
            academyId,
          ),
        )
      ).summary.availableBalanceAmount;

    const choreographyDetail = await loadChoreographyFinanceDetail({
      params: {
        academyId: academy.academyId,
        choreographyId: academy.choreographyId,
      },
      request: await adminRequest(
        `http://localhost/administracion/finanzas/${academy.academyId}/coreografias/${academy.choreographyId}?evento=${event.id}`,
      ),
    });
    const seminarDetail = await loadSeminarFinanceDetail({
      params: {
        academyId: individual.ownerId,
        seminarId: individual.seminarId,
      },
      request: await adminRequest(
        `http://localhost/administracion/finanzas/${individual.ownerId}/seminarios/${individual.seminarId}?evento=${event.id}`,
      ),
    });
    const portal = await loadPortalAcademyFinances(
      new Request("http://localhost/portal/finanzas", {
        headers: { cookie: academy.cookie },
      }),
    );
    const individualArea = await loadIndividualFinances(
      new Request(`http://localhost${individualFinancesPath}`, {
        headers: { cookie: individual.cookie },
      }),
    );

    expect({
      choreographyDetail: choreographyDetail.availableBalanceAmount,
      list: listBalance(academy.academyId),
      ownerPage: await ownerPage(academy.academyId),
      portal: portal.summary.availableBalanceAmount,
    }).toEqual({
      choreographyDetail: academyBalance,
      list: academyBalance,
      ownerPage: academyBalance,
      portal: academyBalance,
    });
    expect({
      individualArea: individualArea.summary.availableBalanceAmount,
      list: listBalance(individual.ownerId),
      ownerPage: await ownerPage(individual.ownerId),
      seminarDetail: seminarDetail.availableBalanceAmount,
    }).toEqual({
      individualArea: individualBalance,
      list: individualBalance,
      ownerPage: individualBalance,
      seminarDetail: individualBalance,
    });

    const academyPayments = await readPaymentsAvailable(
      academy.academyId,
      event.id,
    );
    const individualPayments = await readPaymentsAvailable(
      individual.ownerId,
      event.id,
    );

    expect(academyPayments).toEqual([0, 500, 3000]);
    expect(sum(academyPayments)).toBe(academyBalance);
    expect(sum(individualPayments)).toBe(individualBalance);
  });
});

function sum(amounts: number[]) {
  return amounts.reduce((total, amount) => total + amount, 0);
}

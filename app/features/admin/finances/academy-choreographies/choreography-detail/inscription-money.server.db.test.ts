import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  payments,
  prices,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import * as businessTimeZone from "@/lib/shared/business-time-zone";
import { action as choreographyDetailAction } from "@/routes/administracion.finanzas_.$academyId_.coreografias_.$choreographyId";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
  registerPaymentForTest,
} from "../../../../../lib/admin/finances/finances.test-support";

import { loadChoreographyFinanceDetail } from "./server";

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

/**
 * One inscription of a `solo` choreography priced at 10000 (deposit 3000), and
 * as many payments as asked for, in the order they are given. Two payments is
 * what makes the unwind order observable: the newest one has to empty first.
 */
async function seedInscription(paymentAmounts = [50000]) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Asignación",
      email: `asignacion.${crypto.randomUUID()}@example.com`,
      choreographyName: "Asignación coreografía",
      event,
    });
  const dancer = await createDancer(academy.academy.id, {
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

  for (const amount of paymentAmounts) {
    await registerPaymentForTest({
      academyId: academy.academy.id,
      amount: String(amount),
      eventId: event.id,
      paymentDate: "2026-04-10",
    });
  }

  const academyPayments = await db
    .select({ id: payments.id, paymentNumber: payments.paymentNumber })
    .from(payments)
    .where(eq(payments.academyId, academy.academy.id))
    .orderBy(asc(payments.paymentNumber));

  const [price] = await db
    .select({ id: prices.id })
    .from(prices)
    .where(eq(prices.eventId, event.id));

  return {
    academyId: academy.academy.id,
    choreographyId: choreography.id,
    eventId: event.id,
    inscriptionId: inscription.id,
    payments: academyPayments,
    priceId: price.id,
  };
}

async function postDetailAction(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  fields: Record<string, string>;
}) {
  const requestUrl = `http://localhost/administracion/finanzas/${input.academyId}/coreografias/${input.choreographyId}?evento=${input.eventId}`;
  const signedIn = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl,
  });
  const formData = new FormData();
  for (const [name, value] of Object.entries(input.fields)) {
    formData.set(name, value);
  }

  const request = new Request(requestUrl, {
    method: "POST",
    body: formData,
    headers: { cookie: signedIn.request.headers.get("cookie") ?? "" },
  });

  try {
    return await choreographyDetailAction({
      request,
      params: {
        academyId: input.academyId,
        choreographyId: input.choreographyId,
      },
      context: {},
    } as never);
  } catch (thrown) {
    // Redirects are thrown as a `Response` (React Router's convention).
    if (thrown instanceof Response) {
      return thrown;
    }
    throw thrown;
  }
}

async function loadDetail(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}) {
  const requestUrl = `http://localhost/administracion/finanzas/${input.academyId}/coreografias/${input.choreographyId}?evento=${input.eventId}`;
  const { request } = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl,
  });

  return await loadChoreographyFinanceDetail({
    params: {
      academyId: input.academyId,
      choreographyId: input.choreographyId,
    },
    request,
  });
}

/**
 * A second `solo` row at 12000 (deposit 3600) whose deadline falls before the
 * catalogue one's, so it is also the row that applies on the mocked business
 * date. Two rows on either side of a threshold is what makes "which price is
 * the crossing measured against?" an observable question.
 */
async function insertLatePrice(eventId: string) {
  const [price] = await db
    .insert(prices)
    .values({
      amount: 12000,
      eventId,
      groupType: "solo",
      name: "Solo tardío",
      paymentDeadline: "2026-04-30",
      scheduleId: null,
    })
    .returning();

  if (!price) {
    throw new Error("Expected a price row.");
  }

  return price;
}

async function readAllocations(inscriptionId: string) {
  return await db
    .select({
      amount: paymentAllocations.amount,
      paymentId: paymentAllocations.paymentId,
    })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.inscriptionId, inscriptionId));
}

describe.sequential("money on an inscription through the route action", () => {
  test("allocates an arbitrary amount and leaves the row deposit pending with its shortfall", async () => {
    const fixture = await seedInscription();

    const response = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "2000",
      },
    });

    expect(response).toMatchObject({ status: 302 });
    expect(await readAllocations(fixture.inscriptionId)).toEqual([
      { amount: 2000, paymentId: fixture.payments[0].id },
    ]);

    const detail = await loadDetail(fixture);
    // A partial allocation is an ordinary outcome: the row reads
    // `Seña pendiente` with its shortfall, not as unpaid.
    expect(detail.inscriptions[0]).toMatchObject({
      allocatedAmount: 2000,
      financialStatus: "depositPending",
      owedBalanceAmount: 8000,
      owedDepositAmount: 1000,
    });
  });

  test("writes the price chosen inside the dialog on the first allocation", async () => {
    const fixture = await seedInscription();

    await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "1000",
      },
    });

    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.inscriptionId),
    });
    expect(inscription?.selectedPriceId).toBe(fixture.priceId);
  });

  test("lets the price move while the inscription is below its deposit", async () => {
    const fixture = await seedInscription();
    const otherPrice = await insertLatePrice(fixture.eventId);

    await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "1000",
      },
    });

    // 1000 against a stored price of 10000 is one third of the way to its 3000
    // deposit: nothing is fixed yet, so the administrator may still say which row
    // prices this inscription.
    const result = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: otherPrice.id,
        amount: "1000",
      },
    });

    expect(result).toMatchObject({ status: 302 });
    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.inscriptionId),
    });
    expect(inscription?.selectedPriceId).toBe(otherPrice.id);
    expect(await readAllocations(fixture.inscriptionId)).toEqual([
      { amount: 2000, paymentId: fixture.payments[0].id },
    ]);
  });

  test("locks the price once the inscription covers its deposit", async () => {
    const fixture = await seedInscription();
    const otherPrice = await insertLatePrice(fixture.eventId);

    // Exactly the deposit of the stored 10000 row, and the boundary is `≥`. The
    // badge reads on the same `≥` but against the deposit of the **effective**
    // price, so the two coincide only once the lock has closed — above the
    // threshold the effective row is the stored one. Below it they can part
    // ways; `docs/domain/finances.md` documents that band.
    await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "3000",
      },
    });

    const result = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: otherPrice.id,
        amount: "1000",
      },
    });

    expect(result).toMatchObject({ status: "error" });
    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.inscriptionId),
    });
    expect(inscription?.selectedPriceId).toBe(fixture.priceId);
    // Refused whole: the amount did not land either.
    expect(await readAllocations(fixture.inscriptionId)).toEqual([
      { amount: 3000, paymentId: fixture.payments[0].id },
    ]);
  });

  test("measures the crossing against the stored price and not the incoming one", async () => {
    const fixture = await seedInscription();
    const otherPrice = await insertLatePrice(fixture.eventId);

    // Stored at 12000, whose deposit is 3600, holding 3000.
    await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: otherPrice.id,
        amount: "3000",
      },
    });

    // 3000 would be a crossing of the **incoming** 10000 row, whose deposit is
    // exactly 3000. Were the rule tested against the incoming price it would
    // refuse here, and whether the inscription had "crossed" would depend on
    // which price it was asked about.
    const result = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "500",
      },
    });

    expect(result).toMatchObject({ status: 302 });
    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.inscriptionId),
    });
    expect(inscription?.selectedPriceId).toBe(fixture.priceId);
  });

  test("reopens the price when money drops the inscription back below its deposit", async () => {
    const fixture = await seedInscription();
    const otherPrice = await insertLatePrice(fixture.eventId);

    await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "3000",
      },
    });

    // The escape hatch is no longer "take every peso off": dropping back below
    // the deposit is enough, and the money that stays keeps its row.
    await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "remove-inscription-money",
        inscriptionId: fixture.inscriptionId,
        amount: "1",
      },
    });

    const result = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: otherPrice.id,
        amount: "1",
      },
    });

    expect(result).toMatchObject({ status: 302 });
    const inscription = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, fixture.inscriptionId),
    });
    expect(inscription?.selectedPriceId).toBe(otherPrice.id);
  });

  test("refuses active over-allocation with no override", async () => {
    const fixture = await seedInscription();

    const result = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "10001",
      },
    });

    expect(result).toMatchObject({ status: "error" });
    expect(await readAllocations(fixture.inscriptionId)).toHaveLength(0);
  });

  test("removes an arbitrary amount newest-first without naming a payment", async () => {
    const fixture = await seedInscription([4000, 4000]);

    await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "6000",
      },
    });

    const response = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "remove-inscription-money",
        inscriptionId: fixture.inscriptionId,
        amount: "2000",
      },
    });

    expect(response).toMatchObject({ status: 302 });
    // Funded oldest-first (4000 + 2000) and unwound newest-first: the one left
    // empty is the second, without anyone having picked it.
    expect(await readAllocations(fixture.inscriptionId)).toEqual([
      { amount: 4000, paymentId: fixture.payments[0].id },
    ]);
  });

  test("keeps the fixed price when only part of the money is removed", async () => {
    const fixture = await seedInscription();

    await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "3000",
      },
    });

    const response = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "remove-inscription-money",
        inscriptionId: fixture.inscriptionId,
        amount: "1000",
      },
    });

    expect(response).toMatchObject({ status: 302 });
    expect(await readAllocations(fixture.inscriptionId)).toEqual([
      { amount: 2000, paymentId: fixture.payments[0].id },
    ]);

    const [row] = await db
      .select({ selectedPriceId: choreographyDancers.selectedPriceId })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.id, fixture.inscriptionId));

    // The price stays. The removal shapes carry no price control at all, so
    // nothing here could have moved it — dropping back below the deposit reopens
    // the lock, it does not clear the stored row.
    expect(row.selectedPriceId).toBe(fixture.priceId);
  });

  test("removing money never blocks and the figures re-derive from what remains", async () => {
    const fixture = await seedInscription();

    await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "10000",
      },
    });

    const response = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "remove-inscription-money",
        inscriptionId: fixture.inscriptionId,
        amount: "8000",
      },
    });

    expect(response).toMatchObject({ status: 302 });
    const detail = await loadDetail(fixture);
    expect(detail.inscriptions[0]).toMatchObject({
      allocatedAmount: 2000,
      financialStatus: "depositPending",
      owedDepositAmount: 1000,
    });
  });

  test("releases exactly the over-allocated excess and nothing more", async () => {
    const fixture = await seedInscription();

    await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "allocate-inscription",
        inscriptionId: fixture.inscriptionId,
        priceId: fixture.priceId,
        amount: "10000",
      },
    });

    // Passive over-allocation: the total drops under money that already landed,
    // which is the only way an inscription gets an excess.
    await db
      .update(prices)
      .set({ amount: 8000 })
      .where(eq(prices.id, fixture.priceId));

    const response = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "release-inscription-excess",
        inscriptionId: fixture.inscriptionId,
      },
    });

    expect(response).toMatchObject({ status: 302 });
    expect(await readAllocations(fixture.inscriptionId)).toEqual([
      { amount: 8000, paymentId: fixture.payments[0].id },
    ]);

    const detail = await loadDetail(fixture);
    expect(detail.inscriptions[0]).toMatchObject({
      financialStatus: "paidInFull",
      overAllocatedAmount: 0,
    });
  });

  test("refuses to release an excess a row does not have", async () => {
    const fixture = await seedInscription();

    const result = await postDetailAction({
      academyId: fixture.academyId,
      choreographyId: fixture.choreographyId,
      eventId: fixture.eventId,
      fields: {
        intent: "release-inscription-excess",
        inscriptionId: fixture.inscriptionId,
      },
    });

    expect(result).toMatchObject({ status: "error" });
  });
});

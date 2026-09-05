import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations, payments } from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
} from "@/lib/admin/finances/finances.test-support";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { loadPaymentsList } from "./server";

installDatabaseTestHooks();

describe.sequential("admin payments list", () => {
  // Three payments in the state the pool leaves them in: drained oldest-first,
  // so one is spent, one is partly drawn and the newest is untouched.
  test("reads what is still free on each payment and over the event", async () => {
    const fixture = await buildPaymentsFixture();

    const loaderData = await loadPaymentsList(await listRequest(fixture));

    expect(rowsByNumber(loaderData)).toEqual({
      1: { amount: 10000, availableAmount: 0 },
      2: { amount: 8000, availableAmount: 3000 },
      3: { amount: 5000, availableAmount: 5000 },
    });
    expect(loaderData.summary).toEqual({
      availableAmount: 8000,
      totalAmount: 23000,
    });
  });

  test("narrows the list to the payments that still have money free", async () => {
    const fixture = await buildPaymentsFixture();

    const loaderData = await loadPaymentsList(
      await listRequest(fixture, "disponible=con"),
    );

    expect(Object.keys(rowsByNumber(loaderData))).toEqual(["2", "3"]);
    expect(loaderData.totalCount).toBe(2);
  });

  test("narrows the list to the payments already fully applied", async () => {
    const fixture = await buildPaymentsFixture();

    const loaderData = await loadPaymentsList(
      await listRequest(fixture, "disponible=sin"),
    );

    expect(Object.keys(rowsByNumber(loaderData))).toEqual(["1"]);
    expect(loaderData.totalCount).toBe(1);
  });

  // The cards answer for the event, so narrowing the list must not move them:
  // the reader consults the position and then filters down to it.
  test("keeps the summary on the whole event under any filter", async () => {
    const fixture = await buildPaymentsFixture();

    for (const search of [
      "disponible=con",
      "disponible=sin",
      "medio=efectivo",
    ]) {
      const loaderData = await loadPaymentsList(
        await listRequest(fixture, search),
      );

      expect(loaderData.summary).toEqual({
        availableAmount: 8000,
        totalAmount: 23000,
      });
    }
  });

  test("keeps the availability filter in the canonical url", async () => {
    const fixture = await buildPaymentsFixture();

    const loaderData = await loadPaymentsList(
      await listRequest(fixture, "disponible=con"),
    );

    expect(loaderData.filters.availability).toBe("con");
  });

  // An unknown value is not a filter. It is dropped the same way every other
  // unrecognised parameter is —by redirecting to the canonical url— so the
  // address bar never claims a narrowing that is not applied.
  test("drops an unknown availability value from the url", async () => {
    const fixture = await buildPaymentsFixture();

    const redirect = await expectThrownRedirect(
      await listRequest(fixture, "disponible=quizas"),
    );

    expect(redirect.headers.get("location")).toBe(
      `/administracion/pagos?evento=${fixture.eventId}`,
    );
  });
});

async function expectThrownRedirect(request: Request): Promise<Response> {
  try {
    await loadPaymentsList(request);
  } catch (thrown) {
    if (thrown instanceof Response) {
      return thrown;
    }

    throw thrown;
  }

  throw new Error("Expected the payments list to redirect.");
}

async function buildPaymentsFixture() {
  const event = await createSavedEvent();
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: "Academia Pagos",
      choreographyName: "Aire",
      email: "academia.pagos.lista@example.com",
      event,
    });
  const inscription = await insertInscription({
    academyId: academy.academy.id,
    choreographyId: choreography.id,
  });

  const inserted = await db
    .insert(payments)
    .values(
      [
        { amount: 10000, paymentNumber: 1 },
        { amount: 8000, paymentNumber: 2 },
        { amount: 5000, paymentNumber: 3 },
      ].map((payment) => ({
        ...payment,
        academyId: academy.academy.id,
        eventId: event.id,
        paymentDate: "2026-03-15",
        paymentMethod: "transferencia" as const,
      })),
    )
    .returning();

  const byNumber = new Map(
    inserted.map((payment) => [payment.paymentNumber, payment]),
  );

  // Oldest-first, which is how the pool draws: the first payment is spent whole
  // and the second is only partly drawn.
  await db.insert(paymentAllocations).values([
    {
      academyId: academy.academy.id,
      amount: 10000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: byNumber.get(1)!.id,
    },
    {
      academyId: academy.academy.id,
      amount: 5000,
      eventId: event.id,
      inscriptionId: inscription.id,
      paymentId: byNumber.get(2)!.id,
    },
  ]);

  return { academyId: academy.academy.id, eventId: event.id };
}

async function insertInscription(input: {
  academyId: string;
  choreographyId: string;
}) {
  const dancer = await createDancer(input.academyId, {
    firstName: "Ana",
    lastName: "López",
  });

  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: input.choreographyId,
      dancerId: dancer.id,
    })
    .returning();

  return inscription;
}

async function listRequest(
  fixture: { eventId: string },
  search = "",
): Promise<Request> {
  const query = search.length > 0 ? `&${search}` : "";
  const { request } = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl: `http://localhost/administracion/pagos?evento=${fixture.eventId}${query}`,
  });

  return request;
}

function rowsByNumber(
  loaderData: Awaited<ReturnType<typeof loadPaymentsList>>,
): Record<number, { amount: number; availableAmount: number }> {
  return Object.fromEntries(
    [...loaderData.rows]
      .sort((left, right) => left.paymentNumber - right.paymentNumber)
      .map((row) => [
        row.paymentNumber,
        { amount: row.amount, availableAmount: row.availableAmount },
      ]),
  );
}

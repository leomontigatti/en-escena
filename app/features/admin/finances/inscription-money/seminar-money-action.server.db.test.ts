import { eq } from "drizzle-orm";
import { RouterContextProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { paymentAllocations, seminarInscriptions } from "@/db/schema";
import { action as seminarInscriptionFinancesAction } from "@/routes/administracion.finanzas_.seminarios";
import { action as seminarFinanceDetailAction } from "@/routes/administracion.finanzas_.$academyId_.seminarios_.$seminarId";
import {
  buildSeminarMoneyPostRequest,
  seedEventSeminarFinanceFixture,
  seminarFinanceDetailRequestUrl,
  seminarInscriptionFinancesUrl,
  type EventSeminarFinanceFixture,
} from "@/lib/admin/finances/seminar-finances.test-support";
import { partialRetainedReleaseMessage } from "@/lib/finances/withdrawal-retention-refusals";
import { removeSeminarInscription } from "@/lib/seminars/inscriptions.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * The seminar money gestures are one handler keyed by the inscription alone,
 * reached from two routes: the event-wide list, which stays put after a write,
 * and the `(seminar, academy)` detail, which redirects to itself.
 */
describe("the seminar inscription money action", () => {
  test("allocates from the list, reading academy and seminar off the inscription, and stays", async () => {
    const fixture = await seedEventSeminarFinanceFixture();

    const result = await postToList(fixture, {
      amount: "10000",
      inscriptionId: fixture.nicolasInscriptionId,
      intent: "allocate-inscription",
      priceId: fixture.priceId,
    });

    expect(result).toEqual({ message: "Dinero asignado.", status: "success" });
    expect(await readAllocatedAmount(fixture.nicolasInscriptionId)).toBe(10000);
  });

  test("draws on the inscription's own academy's pool", async () => {
    const fixture = await seedEventSeminarFinanceFixture();

    // The south academy has paid nothing; the north one's payment is not its
    // money, so the allocation has nothing to come out of.
    const result = await postToList(fixture, {
      amount: "10000",
      inscriptionId: fixture.luzInscriptionId,
      intent: "allocate-inscription",
      priceId: fixture.priceId,
    });

    expect(result).toMatchObject({ status: "error" });
    expect(await readAllocatedAmount(fixture.luzInscriptionId)).toBe(0);
  });

  test("takes money off and releases nothing that is not excess, from the list", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    await postToList(fixture, {
      amount: "10000",
      inscriptionId: fixture.anaInscriptionId,
      intent: "allocate-inscription",
      priceId: fixture.priceId,
    });

    const removed = await postToList(fixture, {
      amount: "4000",
      inscriptionId: fixture.anaInscriptionId,
      intent: "remove-inscription-money",
    });
    const released = await postToList(fixture, {
      inscriptionId: fixture.anaInscriptionId,
      intent: "release-inscription-excess",
    });

    expect(removed).toEqual({ message: "Dinero quitado.", status: "success" });
    expect(released).toEqual({
      message: "Esta inscripción no tiene excedente para liberar.",
      status: "error",
    });
    expect(await readAllocatedAmount(fixture.anaInscriptionId)).toBe(6000);
  });

  test("refuses an inscription the event does not hold, and a choreography target", async () => {
    const fixture = await seedEventSeminarFinanceFixture();

    const missing = await postToList(fixture, {
      amount: "1000",
      inscriptionId: "no-such-inscription",
      intent: "allocate-inscription",
    });
    const choreographyTarget = await postToList(fixture, {
      amount: "1000",
      inscriptionId: fixture.anaInscriptionId,
      intent: "allocate-inscription",
      targetKind: "choreography",
    });

    expect(missing).toEqual({
      message: "No encontramos esa inscripción.",
      status: "error",
    });
    expect(choreographyTarget).toEqual({
      message: "No pudimos procesar esa acción.",
      status: "error",
    });
  });

  test("refuses the auditor on the list", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    const request = await buildSeminarMoneyPostRequest({
      fields: {
        amount: "1000",
        inscriptionId: fixture.anaInscriptionId,
        intent: "allocate-inscription",
      },
      role: "auditor",
      url: seminarInscriptionFinancesUrl(fixture.eventId),
    });

    await expect(
      seminarInscriptionFinancesAction(routeArgs(request, {})),
    ).rejects.toMatchObject({ status: 403 });
  });

  test("allocates from the detail and redirects back to it", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    const detailUrl = seminarFinanceDetailRequestUrl({
      academyId: fixture.northAcademyId,
      eventId: fixture.eventId,
      seminarId: fixture.abrilSeminarId,
    });
    const request = await buildSeminarMoneyPostRequest({
      fields: {
        amount: "10000",
        inscriptionId: fixture.anaInscriptionId,
        intent: "allocate-inscription",
        priceId: fixture.priceId,
      },
      url: detailUrl,
    });

    const thrown = await seminarFinanceDetailAction(
      routeArgs(request, {
        academyId: fixture.northAcademyId,
        seminarId: fixture.abrilSeminarId,
      }),
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe(
      new URL(detailUrl).pathname + new URL(detailUrl).search,
    );
    expect(await readAllocatedAmount(fixture.anaInscriptionId)).toBe(10000);
  });

  // The detail is about one `(seminar, academy)` pair, so a form naming an
  // inscription of another pair is refused there even though the handler
  // could place the money.
  test("refuses, on the detail, an inscription outside its seminar and academy", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    const detailUrl = seminarFinanceDetailRequestUrl({
      academyId: fixture.northAcademyId,
      eventId: fixture.eventId,
      seminarId: fixture.abrilSeminarId,
    });
    const request = await buildSeminarMoneyPostRequest({
      fields: {
        amount: "10000",
        inscriptionId: fixture.nicolasInscriptionId,
        intent: "allocate-inscription",
        priceId: fixture.priceId,
      },
      url: detailUrl,
    });

    const result = await seminarFinanceDetailAction(
      routeArgs(request, {
        academyId: fixture.northAcademyId,
        seminarId: fixture.abrilSeminarId,
      }),
    );

    expect(result).toEqual({
      message: "No encontramos esa inscripción.",
      status: "error",
    });
    expect(await readAllocatedAmount(fixture.nicolasInscriptionId)).toBe(0);
  });
});

// #1065: a withdrawn seminar inscription keeps its whole retained deposit (half of
// the 20000 row) or releases all of it, never an amount in between.
describe("the deposit a withdrawn seminar inscription retains", () => {
  /** 15000 on Ana's row, then administration's removal withdraws it. */
  async function seedWithdrawn() {
    const fixture = await seedEventSeminarFinanceFixture();
    await postToList(fixture, {
      amount: "15000",
      inscriptionId: fixture.anaInscriptionId,
      intent: "allocate-inscription",
      priceId: fixture.priceId,
    });
    await removeSeminarInscription({
      inscriptionId: fixture.anaInscriptionId,
      seminarId: fixture.abrilSeminarId,
    });

    return fixture;
  }

  test("retains the deposit at withdrawal and releases all of it, refusing anything in between", async () => {
    const fixture = await seedWithdrawn();
    expect(await readAllocatedAmount(fixture.anaInscriptionId)).toBe(10000);

    const partial = await postToList(fixture, {
      amount: "4000",
      inscriptionId: fixture.anaInscriptionId,
      intent: "remove-inscription-money",
    });
    expect(partial).toMatchObject({ status: "error" });
    expect(await readAllocatedAmount(fixture.anaInscriptionId)).toBe(10000);

    const released = await postToList(fixture, {
      inscriptionId: fixture.anaInscriptionId,
      intent: "release-retained-deposit",
    });
    expect(released).toMatchObject({ status: "success" });
    expect(await readAllocatedAmount(fixture.anaInscriptionId)).toBe(0);
  });

  test("refuses to allocate money to a withdrawn inscription", async () => {
    const fixture = await seedWithdrawn();

    const allocated = await postToList(fixture, {
      amount: "1000",
      inscriptionId: fixture.anaInscriptionId,
      intent: "allocate-inscription",
      priceId: fixture.priceId,
    });

    expect(allocated).toMatchObject({ status: "error" });
    expect(await readAllocatedAmount(fixture.anaInscriptionId)).toBe(10000);
  });

  // A withdrawn row can hold more than its deposit; the dialog has no release
  // of just the excess.
  test("refuses to release just the excess of a withdrawn row", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    await postToList(fixture, {
      amount: "15000",
      inscriptionId: fixture.anaInscriptionId,
      intent: "allocate-inscription",
      priceId: fixture.priceId,
    });
    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: new Date() })
      .where(eq(seminarInscriptions.id, fixture.anaInscriptionId));

    const released = await postToList(fixture, {
      inscriptionId: fixture.anaInscriptionId,
      intent: "release-inscription-excess",
    });

    expect(released).toMatchObject({
      message: partialRetainedReleaseMessage,
      status: "error",
    });
    expect(await readAllocatedAmount(fixture.anaInscriptionId)).toBe(15000);
  });
});

async function postToList(
  fixture: EventSeminarFinanceFixture,
  fields: Record<string, string>,
) {
  const request = await buildSeminarMoneyPostRequest({
    fields,
    url: seminarInscriptionFinancesUrl(fixture.eventId),
  });

  return await seminarInscriptionFinancesAction(routeArgs(request, {}));
}

function routeArgs<TParams extends Record<string, string>>(
  request: Request,
  params: TParams,
) {
  return {
    context: new RouterContextProvider(),
    params,
    pattern: new URL(request.url).pathname,
    request,
    url: new URL(request.url),
  };
}

async function readAllocatedAmount(inscriptionId: string) {
  const rows = await db
    .select({ amount: paymentAllocations.amount })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.seminarInscriptionId, inscriptionId));

  return rows.reduce((sum, row) => sum + row.amount, 0);
}

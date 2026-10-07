import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { paymentAllocations } from "@/db/schema";
import { action as seminarInscriptionFinancesAction } from "@/routes/administracion.finanzas_.seminarios";
import { action as seminarFinanceDetailAction } from "@/routes/administracion.finanzas_.$academyId_.seminarios_.$seminarId";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import {
  buildSeminarMoneyPostRequest,
  seedEventSeminarFinanceFixture,
  seminarFinanceDetailRequestUrl,
  seminarInscriptionFinancesUrl,
  type EventSeminarFinanceFixture,
} from "../../../../lib/admin/finances/seminar-finances.test-support";

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

    expect(result).toBeNull();
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

    expect(removed).toBeNull();
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
    context: {},
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

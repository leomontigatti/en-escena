import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { seminarInscriptions } from "@/db/schema";
import { loadAcademyFinances } from "@/features/admin/finances/academy-choreographies/server";
import { createDancer } from "@/lib/choreographies/registration.test-support";

import { FACTURA_C_CBTE_TIPO } from "@/lib/comprobantes/arca/factura-c";
import { seminarAnchor } from "@/lib/comprobantes/anchor";
import { facturaCInput } from "@/lib/comprobantes/comprobante-emission.test-support";
import { recordComprobante } from "@/lib/comprobantes/comprobantes.server";
import {
  seedEventSeminarFinanceFixture,
  seminarFinanceDetailRequestUrl,
} from "@/lib/admin/finances/seminar-finances.test-support";
import { createSignedInRequest } from "@/lib/test-support/auth";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";

import { loadSeminarFinanceDetail } from "./server";

installDatabaseTestHooks();

// The shared snapshot, re-anchored on one `(seminar, academy)` pair. With an
// inscription it bills that one row at its full 20.000.
async function recordSeminarInvoice(input: {
  academyId: string;
  cbteNro: number;
  eventId: string;
  inscriptionId?: string;
  seminarId: string;
}) {
  return await recordComprobante({
    ...facturaCInput({ choreographyId: "unused", eventId: input.eventId }),
    anchor: seminarAnchor(input.seminarId, input.academyId),
    cbteNro: input.cbteNro,
    ...(input.inscriptionId
      ? {
          impTotal: 20000,
          lines: [{ seminarInscriptionId: input.inscriptionId, amount: 20000 }],
        }
      : {}),
  });
}

async function loadDetail(input: {
  academyId: string;
  eventId: string;
  seminarId: string;
}) {
  const { request } = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl: seminarFinanceDetailRequestUrl(input),
  });

  return await loadSeminarFinanceDetail({
    params: { academyId: input.academyId, seminarId: input.seminarId },
    request,
  });
}

describe("the seminar financial detail's comprobantes tab", () => {
  // The seminar is sold to several academies at once, so its comprobantes are
  // the pair's: another academy's in the same seminar are not this detail's.
  test("lists the comprobantes of its `(seminar, academy)` pair alone", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    const north = await recordSeminarInvoice({
      academyId: fixture.northAcademyId,
      cbteNro: 1,
      eventId: fixture.eventId,
      seminarId: fixture.brunoSeminarId,
    });
    await recordSeminarInvoice({
      academyId: fixture.southAcademyId,
      cbteNro: 2,
      eventId: fixture.eventId,
      seminarId: fixture.brunoSeminarId,
    });
    await recordSeminarInvoice({
      academyId: fixture.northAcademyId,
      cbteNro: 3,
      eventId: fixture.eventId,
      seminarId: fixture.abrilSeminarId,
    });

    const loaderData = await loadDetail({
      academyId: fixture.northAcademyId,
      eventId: fixture.eventId,
      seminarId: fixture.brunoSeminarId,
    });

    expect(loaderData.comprobantes).toEqual([
      {
        cbteFch: "20260722",
        cbteNro: 1,
        cbteTipo: FACTURA_C_CBTE_TIPO,
        id: north.id,
        impTotal: 10000,
        ptoVta: 1,
      },
    ]);
  });

  test("lists no comprobante for a pair never invoiced", async () => {
    const fixture = await seedEventSeminarFinanceFixture();

    const loaderData = await loadDetail({
      academyId: fixture.northAcademyId,
      eventId: fixture.eventId,
      seminarId: fixture.brunoSeminarId,
    });

    expect(loaderData.comprobantes).toEqual([]);
  });
});

describe("what a `(seminar, academy)` unit's documents leave pending", () => {
  async function loadList(input: { academyId: string; eventId: string }) {
    const { request } = await createSignedInRequest({
      email: `${crypto.randomUUID()}@example.com`,
      role: "admin",
      requestUrl: `http://localhost/administracion/finanzas/${input.academyId}?evento=${input.eventId}`,
    });

    return await loadAcademyFinances({
      params: { academyId: input.academyId },
      request,
    });
  }

  test("a person registered after invoicing reads `Sin facturar`, and the unit `Pendiente de facturar` on the list and the detail", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    await recordSeminarInvoice({
      academyId: fixture.northAcademyId,
      cbteNro: 1,
      eventId: fixture.eventId,
      inscriptionId: fixture.anaInscriptionId,
      seminarId: fixture.abrilSeminarId,
    });
    const late = await createDancer(fixture.northAcademyId, {
      firstName: "Olga",
      lastName: "Ruiz",
    });
    const [added] = await db
      .insert(seminarInscriptions)
      .values({ dancerId: late.id, seminarId: fixture.abrilSeminarId })
      .returning();
    const unit = {
      academyId: fixture.northAcademyId,
      eventId: fixture.eventId,
      seminarId: fixture.abrilSeminarId,
    };

    const detail = await loadDetail(unit);
    const list = await loadList(unit);

    expect(detail.seminar?.anomalies).toEqual(["pendingDebitNote"]);
    expect(detail.billing).toMatchObject({
      anomaly: "pendingDebitNote",
      amount: 20000,
    });
    expect(
      detail.inscriptions
        .filter((inscription) => inscription.uninvoiced)
        .map((inscription) => inscription.inscriptionId),
    ).toEqual([added.id]);
    expect(
      list.seminarFinanceRows.find((row) => row.id === fixture.abrilSeminarId),
    ).toMatchObject({ anomalies: ["pendingDebitNote"], creditClockDays: null });
    // A unit never invoiced reads nothing.
    expect(
      list.seminarFinanceRows.find((row) => row.id === fixture.brunoSeminarId),
    ).toMatchObject({ anomalies: [], creditClockDays: null });
  });

  test("a withdrawal after invoicing reads `Pendiente de acreditar` with its day count on the list and the detail", async () => {
    const fixture = await seedEventSeminarFinanceFixture();
    await recordSeminarInvoice({
      academyId: fixture.northAcademyId,
      cbteNro: 1,
      eventId: fixture.eventId,
      inscriptionId: fixture.nicolasInscriptionId,
      seminarId: fixture.brunoSeminarId,
    });
    // Withdrawn holding nothing: the whole line is owed back.
    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(seminarInscriptions.id, fixture.nicolasInscriptionId));
    const unit = {
      academyId: fixture.northAcademyId,
      eventId: fixture.eventId,
      seminarId: fixture.brunoSeminarId,
    };

    const detail = await loadDetail(unit);
    const list = await loadList(unit);

    expect(detail.billing).toMatchObject({
      anomaly: "pendingCreditNote",
      amount: 20000,
      creditClockDays: 2,
    });
    expect(
      list.seminarFinanceRows.find((row) => row.id === fixture.brunoSeminarId),
    ).toMatchObject({
      anomalies: ["pendingCreditNote"],
      creditClockDays: 2,
    });
  });
});

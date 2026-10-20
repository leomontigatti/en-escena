import { describe, expect, test } from "vitest";

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

// The shared snapshot, re-anchored on one `(seminar, academy)` pair.
async function recordSeminarInvoice(input: {
  academyId: string;
  cbteNro: number;
  eventId: string;
  seminarId: string;
}) {
  return await recordComprobante({
    ...facturaCInput({ choreographyId: "unused", eventId: input.eventId }),
    anchor: seminarAnchor(input.seminarId, input.academyId),
    cbteNro: input.cbteNro,
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

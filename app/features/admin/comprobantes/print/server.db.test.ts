import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { seminars } from "@/db/schema";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import {
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { choreographyAnchor, seminarAnchor } from "@/lib/comprobantes/anchor";
import {
  recordComprobante,
  type RecordComprobanteInput,
} from "@/lib/comprobantes/comprobantes.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { loadComprobantePrint } from "./server";

installDatabaseTestHooks();

function facturaCInput(
  overrides: Partial<RecordComprobanteInput> & { eventId: string },
): RecordComprobanteInput {
  return {
    anchor: choreographyAnchor("unused"),
    cbteTipo: 11,
    ptoVta: 1,
    cbteNro: 1,
    cbteFch: "20260722",
    impTotal: 12000,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "75123456789012",
    caeVto: "20260801",
    lines: [],
    ...overrides,
  };
}

async function printHtml(comprobanteId: string) {
  const { request } = await createSignedInAdminRequest({
    email: `comprobantes.print.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/comprobantes/${comprobanteId}/imprimir`,
    role: "admin",
  });
  const response = await loadComprobantePrint(request, comprobanteId);

  return await response.text();
}

describe("loadComprobantePrint", () => {
  test("prints a seminar unit naming the academy and the seminar's instructor and date", async () => {
    const event = await createEventRecord({ active: true });
    const academy = await createAcademyRecord({
      academyName: "Academia Seminario",
      email: `seminario.${crypto.randomUUID()}@example.com`,
    });
    const [seminar] = await db
      .insert(seminars)
      .values({
        eventId: event.id,
        instructorName: "Abril Sosa",
        kind: "regular",
        quota: 20,
        requiredDepositPercentage: 50,
        scheduledDate: "2030-10-10",
        startTime: "18:30",
      })
      .returning();
    const comprobante = await recordComprobante(
      facturaCInput({
        anchor: seminarAnchor(seminar.id, academy.id),
        eventId: event.id,
        // What the emitter freezes for a seminar unit: the seminar's own date on
        // both ends, and the issue date as the payment due date.
        fchServDesde: "20301010",
        fchServHasta: "20301010",
        fchVtoPago: "20260722",
      }),
    );

    const html = await printHtml(comprobante.id);

    expect(html).toContain(
      "<p>Academia Seminario — Seminario Abril Sosa, 10/10/2030</p>",
    );
    expect(html).toContain("<td>Inscripción</td>");
    expect(html).toContain("10/10/2030 — 10/10/2030");
    expect(html).toContain("22/07/2026");
  });

  test("prints a choreography unit naming the academy and the choreography", async () => {
    const event = await createEventRecord({ active: true });
    const catalog = await createEventCatalog(event.id);
    const academy = await createAcademyRecord({
      academyName: "Academia Alfa",
      email: `alfa.${crypto.randomUUID()}@example.com`,
    });
    const choreography = await createChoreographyRecord({
      academyId: academy.id,
      eventId: event.id,
      modalityId: catalog.modality.id,
      scheduleCapacityId: catalog.scheduleCapacity.id,
      name: "Tango",
    });
    const comprobante = await recordComprobante(
      facturaCInput({
        anchor: choreographyAnchor(choreography.id),
        eventId: event.id,
      }),
    );

    const html = await printHtml(comprobante.id);

    expect(html).toContain("<p>Academia Alfa — Tango</p>");
  });
});

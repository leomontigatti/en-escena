import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers, payments, seminars } from "@/db/schema";
import { paymentAllocations } from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { FACTURA_C_CBTE_TIPO } from "@/lib/comprobantes/arca/factura-c";
import { seminarAnchor } from "@/lib/comprobantes/anchor";
import { recordComprobante } from "@/lib/comprobantes/comprobantes.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { loadComprobanteDetail } from "./server";

installDatabaseTestHooks();

const ADMIN_EMAIL = "admin.comprobante.detalle@example.com";

let paymentNumberSeq = 0;

async function seedComprobante(input: {
  academyName: string;
  choreographyName: string;
  email: string;
}) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: input.academyName,
      choreographyName: input.choreographyName,
      email: input.email,
      event,
    });
  const dancer = await createDancer(academy.academy.id, {
    firstName: "Ana",
    lastName: "López",
  });
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();

  paymentNumberSeq += 1;
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: academy.academy.id,
      amount: 7000,
      eventId: event.id,
      paymentDate: "2026-07-22",
      paymentMethod: "transferencia",
      paymentNumber: paymentNumberSeq,
    })
    .returning();
  await db.insert(paymentAllocations).values({
    academyId: academy.academy.id,
    amount: 7000,
    eventId: event.id,
    choreographyInscriptionId: inscription.id,
    paymentId: payment.id,
  });

  const factura = await recordComprobante({
    anchor: choreographyAnchor(choreography.id),
    eventId: event.id,
    cbteTipo: FACTURA_C_CBTE_TIPO,
    ptoVta: 1,
    cbteNro: 41,
    cbteFch: "20260722",
    fchServDesde: "20260801",
    fchServHasta: "20260803",
    fchVtoPago: "20260722",
    impTotal: 7000,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "74123456789012",
    caeVto: "20260801",
    lines: [{ choreographyInscriptionId: inscription.id, amount: 7000 }],
  });

  return {
    academyId: academy.academy.id,
    choreographyId: choreography.id,
    eventId: event.id,
    facturaId: factura.id,
  };
}

/**
 * A comprobante anchored at a `(seminar, academy)` unit. It needs no inscription
 * and no line: what the detail reads is the anchor, and the seminar's academy
 * travels on the anchor itself.
 */
async function seedSeminarComprobante() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const academy = await createAcademyUser({
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
  const factura = await recordComprobante({
    anchor: seminarAnchor(seminar.id, academy.academyId),
    eventId: event.id,
    cbteTipo: FACTURA_C_CBTE_TIPO,
    ptoVta: 1,
    cbteNro: 91,
    cbteFch: "20260722",
    fchServDesde: "20301010",
    fchServHasta: "20301010",
    fchVtoPago: "20260722",
    impTotal: 12000,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "74123456789099",
    caeVto: "20260801",
    lines: [],
  });

  return { academyId: academy.academyId, facturaId: factura.id, seminar };
}

function detailUrl(comprobanteId: string) {
  return `http://localhost/administracion/comprobantes/${comprobanteId}`;
}

async function signedInGetRequest(comprobanteId: string) {
  const { request } = await createSignedInRequest({
    email: ADMIN_EMAIL,
    role: "admin",
    requestUrl: detailUrl(comprobanteId),
  });

  return request;
}

describe("loadComprobanteDetail", () => {
  test("loads a seminar comprobante with its `(seminar, academy)` anchor", async () => {
    const seeded = await seedSeminarComprobante();

    const { comprobante } = await loadComprobanteDetail(
      await signedInGetRequest(seeded.facturaId),
      seeded.facturaId,
    );

    expect(comprobante.academyName).toBe("Academia Seminario");
    expect(comprobante.academyId).toBe(seeded.academyId);
    expect(comprobante.anchor).toEqual({
      kind: "seminar",
      seminarId: seeded.seminar.id,
      instructorName: "Abril Sosa",
      scheduledDate: "2030-10-10",
    });
    expect(comprobante.fchServDesde).toBe("20301010");
    expect(comprobante.status).toBe("valid");
  });

  test("loads the comprobante snapshot with its anchoring context", async () => {
    const seeded = await seedComprobante({
      academyName: "Academia Detalle",
      choreographyName: "Coreografía detalle",
      email: "academia.detalle@example.com",
    });

    const { comprobante } = await loadComprobanteDetail(
      await signedInGetRequest(seeded.facturaId),
      seeded.facturaId,
    );

    expect(comprobante.id).toBe(seeded.facturaId);
    expect(comprobante.cbteTipo).toBe(FACTURA_C_CBTE_TIPO);
    expect(comprobante.cbteNro).toBe(41);
    expect(comprobante.impTotal).toBe(7000);
    expect(comprobante.academyName).toBe("Academia Detalle");
    expect(comprobante.anchor).toEqual({
      kind: "choreography",
      choreographyId: seeded.choreographyId,
      choreographyName: "Coreografía detalle",
    });
    expect(comprobante.fchServDesde).toBe("20260801");
    expect(comprobante.fchServHasta).toBe("20260803");
    expect(comprobante.status).toBe("valid");
  });

  test("404s when the comprobante does not exist", async () => {
    await expect(
      loadComprobanteDetail(await signedInGetRequest("missing"), "missing"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

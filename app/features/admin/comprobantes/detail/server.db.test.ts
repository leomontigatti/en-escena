import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { eq } from "drizzle-orm";

import {
  choreographyDancers,
  payments,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import { paymentAllocations } from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
  NOTA_DEBITO_C_CBTE_TIPO,
} from "@/lib/comprobantes/arca/factura-c";
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
    inscriptionId: inscription.id,
  };
}

/**
 * The seeded invoice amended twice: a dancer added after it (a debit note
 * billing her) and then withdrawn with Ana (a credit note crediting both).
 */
async function seedAmendedComprobante() {
  const seeded = await seedComprobante({
    academyName: "Academia Ajustada",
    choreographyName: "Coreografía ajustada",
    email: `ajustada.${crypto.randomUUID()}@example.com`,
  });
  const dancer = await createDancer(seeded.academyId, {
    firstName: "Bruno",
    lastName: "Díaz",
  });
  const [addition] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 15,
      choreographyId: seeded.choreographyId,
      dancerId: dancer.id,
    })
    .returning();
  const note = (cbteTipo: number, cbteNro: number, impTotal: number) => ({
    anchor: choreographyAnchor(seeded.choreographyId),
    eventId: seeded.eventId,
    cbteTipo,
    ptoVta: 1,
    cbteNro,
    cbteFch: "20260801",
    impTotal,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento" as const,
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: `7412345678${cbteNro}`,
    caeVto: "20260811",
    associatedComprobanteId: seeded.facturaId,
  });
  const notaDebito = await recordComprobante({
    ...note(NOTA_DEBITO_C_CBTE_TIPO, 5, 4000),
    lines: [{ choreographyInscriptionId: addition.id, amount: 4000 }],
  });
  const notaCredito = await recordComprobante({
    ...note(NOTA_CREDITO_C_CBTE_TIPO, 6, 9000),
    lines: [
      { choreographyInscriptionId: seeded.inscriptionId, amount: 5000 },
      { choreographyInscriptionId: addition.id, amount: 4000 },
    ],
  });
  await db
    .update(choreographyDancers)
    .set({ withdrawnAt: new Date("2026-07-30T12:00:00Z") })
    .where(eq(choreographyDancers.id, seeded.inscriptionId));

  return {
    ...seeded,
    notaCreditoId: notaCredito.id,
    notaDebitoId: notaDebito.id,
  };
}

/**
 * A comprobante anchored at a `(seminar, academy)` unit. What the detail reads
 * is the anchor, and the seminar's academy travels on the anchor itself; the
 * line, one dancer's inscription, is there only when a test reads it.
 */
async function seedSeminarComprobante({ withLine = false } = {}) {
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
  const lines = [];

  if (withLine) {
    const dancer = await createDancer(academy.academyId, {
      firstName: "Eva",
      lastName: "Ruiz",
    });
    const [inscription] = await db
      .insert(seminarInscriptions)
      .values({ seminarId: seminar.id, dancerId: dancer.id })
      .returning();
    lines.push({ seminarInscriptionId: inscription.id, amount: 12000 });
  }

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
    lines,
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

  test("reads one line per inscription, naming the dancer, withdrawn ones included", async () => {
    const seeded = await seedAmendedComprobante();

    const { comprobante } = await loadComprobanteDetail(
      await signedInGetRequest(seeded.notaCreditoId),
      seeded.notaCreditoId,
    );

    expect(comprobante.lines).toMatchObject([
      {
        description: "Inscripción — Bruno Díaz",
        amount: 4000,
        withdrawn: false,
      },
      { description: "Inscripción — Ana López", amount: 5000, withdrawn: true },
    ]);
  });

  test("an invoice lists the notes that adjust it", async () => {
    const seeded = await seedAmendedComprobante();

    const { comprobante } = await loadComprobanteDetail(
      await signedInGetRequest(seeded.facturaId),
      seeded.facturaId,
    );

    expect(comprobante.status).toBe("adjusted");
    expect(comprobante.association).toMatchObject({
      role: "factura",
      adjustments: [
        { id: seeded.notaDebitoId, cbteNro: 5 },
        { id: seeded.notaCreditoId, cbteNro: 6 },
      ],
    });
  });

  test("a credit note names its invoice and the debit note that billed what it credits", async () => {
    const seeded = await seedAmendedComprobante();

    const { comprobante } = await loadComprobanteDetail(
      await signedInGetRequest(seeded.notaCreditoId),
      seeded.notaCreditoId,
    );

    expect(comprobante.association).toMatchObject({
      role: "note",
      factura: { id: seeded.facturaId, cbteNro: 41 },
      adjustedDebitNotes: [{ id: seeded.notaDebitoId }],
    });
  });

  test("names a seminar line by the person inscribed", async () => {
    const seeded = await seedSeminarComprobante({ withLine: true });

    const { comprobante } = await loadComprobanteDetail(
      await signedInGetRequest(seeded.facturaId),
      seeded.facturaId,
    );

    expect(comprobante.lines).toMatchObject([
      {
        description: "Inscripción — Eva Ruiz",
        amount: 12000,
        withdrawn: false,
      },
    ]);
  });

  test("404s when the comprobante does not exist", async () => {
    await expect(
      loadComprobanteDetail(await signedInGetRequest("missing"), "missing"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

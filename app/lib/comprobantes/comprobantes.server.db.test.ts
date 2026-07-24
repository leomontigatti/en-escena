import { eq, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, choreographyDancers } from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import {
  listChoreographyComprobantes,
  recordComprobante,
  type RecordComprobanteInput,
} from "@/lib/comprobantes/comprobantes.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

function readRows<Row extends object>(result: { rows: Row[] } | Row[]) {
  return Array.isArray(result) ? result : result.rows;
}

async function seedInscribedChoreography(email: string) {
  const event = await createEventRecord({ active: true });
  const academy = await createAcademyRecord({
    academyName: "Academia Comprobante",
    email,
  });
  const catalog = await createEventCatalog(event.id);
  const choreography = await createChoreographyRecord({
    academyId: academy.id,
    eventId: event.id,
    modalityId: catalog.modality.id,
    scheduleCapacityId: catalog.scheduleCapacity.id,
    name: "Coreografía facturada",
  });
  const dancer = await createDancer(academy.id);
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 14,
    })
    .returning();

  return { event, academy, choreography, inscription };
}

// Snapshot de una Factura C a consumidor final anónimo emitida por el emisor
// exento (los valores replican el circuito real del spike #428).
function facturaCInput(
  overrides: Partial<RecordComprobanteInput> & {
    choreographyId: string;
    eventId: string;
  },
): RecordComprobanteInput {
  return {
    cbteTipo: 11,
    ptoVta: 1,
    cbteNro: 1,
    cbteFch: "20260722",
    impTotal: 10000,
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

describe("recordComprobante persistence", () => {
  test("persiste el snapshot fiscal completo de la Factura C con sus líneas por inscripción", async () => {
    const { choreography, inscription } = await seedInscribedChoreography(
      `snapshot.${crypto.randomUUID()}@example.com`,
    );

    await recordComprobante(
      facturaCInput({
        choreographyId: choreography.id,
        eventId: choreography.eventId,
        impTotal: 10000,
        lines: [{ inscriptionId: inscription.id, amount: 10000 }],
      }),
    );

    const [persisted] = await listChoreographyComprobantes(choreography.id);

    expect(persisted).toMatchObject({
      cbteTipo: 11,
      ptoVta: 1,
      cbteNro: 1,
      cbteFch: "20260722",
      impTotal: 10000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      receptorDocTipo: 99,
      receptorDocNro: "0",
      receptorIvaConditionId: 5,
      cae: "75123456789012",
      caeVto: "20260801",
      choreographyId: choreography.id,
    });
    expect(persisted.lines).toEqual([
      expect.objectContaining({
        inscriptionId: inscription.id,
        amount: 10000,
      }),
    ]);
  });

  test("el estado se deriva: vigente por defecto, anulada cuando existe una Nota de crédito asociada", async () => {
    const { choreography, inscription } = await seedInscribedChoreography(
      `estado.${crypto.randomUUID()}@example.com`,
    );

    const factura = await recordComprobante(
      facturaCInput({
        choreographyId: choreography.id,
        eventId: choreography.eventId,
        lines: [{ inscriptionId: inscription.id, amount: 10000 }],
      }),
    );

    const [beforeAnnulment] = await listChoreographyComprobantes(
      choreography.id,
    );
    expect(beforeAnnulment.status).toBe("vigente");

    // Nota de crédito C (tipo 13) espejo, anclada a la misma coreografía y
    // apuntando a la factura vía `associatedComprobanteId` (CbtesAsoc).
    await recordComprobante(
      facturaCInput({
        choreographyId: choreography.id,
        eventId: choreography.eventId,
        cbteTipo: 13,
        cbteNro: 2,
        associatedComprobanteId: factura.id,
        lines: [{ inscriptionId: inscription.id, amount: 10000 }],
      }),
    );

    const afterAnnulment = await listChoreographyComprobantes(choreography.id);
    const facturaRow = afterAnnulment.find((row) => row.id === factura.id);
    const notaCredito = afterAnnulment.find((row) => row.cbteTipo === 13);

    expect(facturaRow?.status).toBe("anulada");
    expect(notaCredito?.status).toBe("vigente");
  });

  test("el estado vigente/anulada no se persiste como columna", async () => {
    const result = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'en_escena_comprobante'`,
    );
    const columns = readRows(result).map((row) => row.column_name);

    for (const forbidden of ["status", "estado", "vigente", "anulada"]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  test("conserva la coreografía ancla viva: no se puede borrar una coreografía con comprobantes (sin huérfanos)", async () => {
    const { choreography, inscription } = await seedInscribedChoreography(
      `ancla.${crypto.randomUUID()}@example.com`,
    );

    await recordComprobante(
      facturaCInput({
        choreographyId: choreography.id,
        eventId: choreography.eventId,
        lines: [{ inscriptionId: inscription.id, amount: 10000 }],
      }),
    );

    await expect(
      db.delete(choreographies).where(eq(choreographies.id, choreography.id)),
    ).rejects.toThrow();

    const survivors = await listChoreographyComprobantes(choreography.id);
    expect(survivors).toHaveLength(1);
  });

  test("la fila emitida sobrevive a la edición de roster: quitar una inscripción no la muta ni la borra", async () => {
    const { choreography, inscription } = await seedInscribedChoreography(
      `roster.${crypto.randomUUID()}@example.com`,
    );

    const factura = await recordComprobante(
      facturaCInput({
        choreographyId: choreography.id,
        eventId: choreography.eventId,
        impTotal: 10000,
        lines: [{ inscriptionId: inscription.id, amount: 10000 }],
      }),
    );

    // La edición de roster (quitar una inscripción) sigue permitida aún con
    // comprobantes emitidos (#340): sólo el borrado de la coreografía está
    // bloqueado.
    await db
      .delete(choreographyDancers)
      .where(eq(choreographyDancers.id, inscription.id));

    const [survivor] = await listChoreographyComprobantes(choreography.id);
    // La fila fiscal es inmutable: su importe total no cambia.
    expect(survivor.id).toBe(factura.id);
    expect(survivor.impTotal).toBe(10000);
    // El vínculo a la inscripción se anula, pero el monto congelado se preserva.
    expect(survivor.lines).toHaveLength(1);
    expect(survivor.lines[0]?.inscriptionId).toBeNull();
    expect(survivor.lines[0]?.amount).toBe(10000);
  });
});

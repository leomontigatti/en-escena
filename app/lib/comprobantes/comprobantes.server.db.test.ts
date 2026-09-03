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

// Snapshot of a `Factura C` to an anonymous final consumer issued by the exempt
// issuer (the values replicate the real circuit of spike #428).
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
  test("persists the `Factura C`'s full fiscal snapshot with its per-inscription lines", async () => {
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

  test("the status is derived: `vigente` by default, `anulada` when an associated credit note exists", async () => {
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

    // A mirror `Nota de crédito C` (type 13), anchored to the same choreography and
    // pointing at the factura via `associatedComprobanteId` (CbtesAsoc).
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

  test("the `vigente`/`anulada` status is not persisted as a column", async () => {
    const result = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'en_escena_comprobante'`,
    );
    const columns = readRows(result).map((row) => row.column_name);

    for (const forbidden of ["status", "estado", "vigente", "anulada"]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  test("keeps the anchor choreography alive: a choreography with comprobantes cannot be deleted (no orphans)", async () => {
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

  test("the emitted row survives a roster edit: removing an inscription neither mutates nor deletes it", async () => {
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

    // Roster editing (removing an inscription) is still allowed even with
    // comprobantes emitted (#340): only deleting the choreography is blocked.
    await db
      .delete(choreographyDancers)
      .where(eq(choreographyDancers.id, inscription.id));

    const [survivor] = await listChoreographyComprobantes(choreography.id);
    // The fiscal row is immutable: its total amount does not change.
    expect(survivor.id).toBe(factura.id);
    expect(survivor.impTotal).toBe(10000);
    // The link to the inscription is nulled out, but the frozen amount is
    // preserved.
    expect(survivor.lines).toHaveLength(1);
    expect(survivor.lines[0]?.inscriptionId).toBeNull();
    expect(survivor.lines[0]?.amount).toBe(10000);
  });
});

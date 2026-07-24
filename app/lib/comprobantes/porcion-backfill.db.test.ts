import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { eq, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  comprobanteInscriptions,
  comprobantes,
  paymentAllocations,
  payments,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// El backfill de la porción (migración 0005, ADR-0011) vive dentro de la
// migración y corre una única vez sobre la base. Para verificar la DERIVACIÓN
// sin duplicar su SQL, este test ejecuta las sentencias `UPDATE` reales del
// archivo de migración contra datos sembrados: es el mismo SQL que corrió la
// migración, no una copia.
const MIGRATION_PATH = fileURLToPath(
  new URL("../../db/migrations/0005_warm_kree.sql", import.meta.url),
);

function loadBackfillStatements(): string[] {
  const contents = readFileSync(MIGRATION_PATH, "utf8");
  return contents
    .split("--> statement-breakpoint")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.toUpperCase().startsWith("UPDATE"));
}

async function runPorcionBackfill() {
  for (const statement of loadBackfillStatements()) {
    await db.execute(sql.raw(statement));
  }
}

async function seedInscription(email: string) {
  const event = await createEventRecord({ active: true });
  const academy = await createAcademyRecord({
    academyName: "Academia Porción",
    email,
  });
  const catalog = await createEventCatalog(event.id);
  const choreography = await createChoreographyRecord({
    academyId: academy.id,
    eventId: event.id,
    modalityId: catalog.modality.id,
    scheduleCapacityId: catalog.scheduleCapacity.id,
    name: "Coreografía porción",
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

let paymentSeq = 0;

async function allocatePayment(input: {
  eventId: string;
  academyId: string;
  inscriptionId: string;
  allocationTypes: Array<"deposit" | "balance">;
  amount: number;
}) {
  const [payment] = await db
    .insert(payments)
    .values({
      eventId: input.eventId,
      academyId: input.academyId,
      paymentNumber: ++paymentSeq,
      paymentDate: "2026-07-01",
      amount: input.amount * input.allocationTypes.length,
      paymentMethod: "transferencia",
    })
    .returning();

  for (const allocationType of input.allocationTypes) {
    await db.insert(paymentAllocations).values({
      paymentId: payment.id,
      inscriptionId: input.inscriptionId,
      academyId: input.academyId,
      eventId: input.eventId,
      allocationType,
      amount: input.amount,
    });
  }
}

// Snapshot mínimo de una Factura C: sólo los campos not-null. `porcion` se omite
// a propósito para que caiga en su default y el backfill deba corregirla.
function facturaCValues(input: {
  choreographyId: string;
  eventId: string;
  cbteNro: number;
  cbteTipo?: number;
  associatedComprobanteId?: string;
}) {
  return {
    choreographyId: input.choreographyId,
    eventId: input.eventId,
    cbteTipo: input.cbteTipo ?? 11,
    ptoVta: 1,
    cbteNro: input.cbteNro,
    cbteFch: "20260722",
    impTotal: 10000,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento" as const,
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "75123456789012",
    caeVto: "20260801",
    associatedComprobanteId: input.associatedComprobanteId ?? null,
  };
}

async function recordFacturaWithLine(input: {
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
  cbteNro: number;
}) {
  const [comprobante] = await db
    .insert(comprobantes)
    .values(facturaCValues(input))
    .returning();
  await db.insert(comprobanteInscriptions).values({
    comprobanteId: comprobante.id,
    inscriptionId: input.inscriptionId,
    amount: 10000,
  });
  return comprobante;
}

describe("backfill de porción (migración 0005)", () => {
  test("una factura que sólo cubre asignaciones de seña deriva porción `seña`", async () => {
    const { event, academy, choreography, inscription } = await seedInscription(
      `sena.${crypto.randomUUID()}@example.com`,
    );
    await allocatePayment({
      eventId: event.id,
      academyId: academy.id,
      inscriptionId: inscription.id,
      allocationTypes: ["deposit"],
      amount: 10000,
    });
    const factura = await recordFacturaWithLine({
      choreographyId: choreography.id,
      eventId: event.id,
      inscriptionId: inscription.id,
      cbteNro: 1,
    });

    await runPorcionBackfill();

    const [row] = await db
      .select({ porcion: comprobantes.porcion })
      .from(comprobantes)
      .where(eq(comprobantes.id, factura.id));
    expect(row.porcion).toBe("seña");
  });

  test("una factura que sólo cubre asignaciones de saldo deriva porción `saldo`", async () => {
    const { event, academy, choreography, inscription } = await seedInscription(
      `saldo.${crypto.randomUUID()}@example.com`,
    );
    await allocatePayment({
      eventId: event.id,
      academyId: academy.id,
      inscriptionId: inscription.id,
      allocationTypes: ["balance"],
      amount: 10000,
    });
    const factura = await recordFacturaWithLine({
      choreographyId: choreography.id,
      eventId: event.id,
      inscriptionId: inscription.id,
      cbteNro: 1,
    });

    await runPorcionBackfill();

    const [row] = await db
      .select({ porcion: comprobantes.porcion })
      .from(comprobantes)
      .where(eq(comprobantes.id, factura.id));
    expect(row.porcion).toBe("saldo");
  });

  test("una factura que cubre seña y saldo deriva porción `total`", async () => {
    const { event, academy, choreography, inscription } = await seedInscription(
      `total.${crypto.randomUUID()}@example.com`,
    );
    await allocatePayment({
      eventId: event.id,
      academyId: academy.id,
      inscriptionId: inscription.id,
      allocationTypes: ["deposit", "balance"],
      amount: 10000,
    });
    const factura = await recordFacturaWithLine({
      choreographyId: choreography.id,
      eventId: event.id,
      inscriptionId: inscription.id,
      cbteNro: 1,
    });

    await runPorcionBackfill();

    const [row] = await db
      .select({ porcion: comprobantes.porcion })
      .from(comprobantes)
      .where(eq(comprobantes.id, factura.id));
    expect(row.porcion).toBe("total");
  });

  test("una Nota de crédito espeja la porción de la factura que anula", async () => {
    const { event, academy, choreography, inscription } = await seedInscription(
      `nc.${crypto.randomUUID()}@example.com`,
    );
    await allocatePayment({
      eventId: event.id,
      academyId: academy.id,
      inscriptionId: inscription.id,
      allocationTypes: ["deposit"],
      amount: 10000,
    });
    const factura = await recordFacturaWithLine({
      choreographyId: choreography.id,
      eventId: event.id,
      inscriptionId: inscription.id,
      cbteNro: 1,
    });
    const [notaCredito] = await db
      .insert(comprobantes)
      .values(
        facturaCValues({
          choreographyId: choreography.id,
          eventId: event.id,
          cbteNro: 2,
          cbteTipo: 13,
          associatedComprobanteId: factura.id,
        }),
      )
      .returning();

    await runPorcionBackfill();

    const [row] = await db
      .select({ porcion: comprobantes.porcion })
      .from(comprobantes)
      .where(eq(comprobantes.id, notaCredito.id));
    expect(row.porcion).toBe("seña");
  });
});

describe("nullabilidad de las columnas de porción y fechas de servicio", () => {
  test("porción es not-null (cae en el default `total`) y las tres fechas son nullable", async () => {
    const { event, choreography } = await seedInscription(
      `null.${crypto.randomUUID()}@example.com`,
    );

    // Insert sin porción ni fechas: la porción cae en su default not-null y las
    // fechas de servicio quedan NULL (Concepto 1 nunca las cargó).
    const [comprobante] = await db
      .insert(comprobantes)
      .values(
        facturaCValues({
          choreographyId: choreography.id,
          eventId: event.id,
          cbteNro: 1,
        }),
      )
      .returning();

    expect(comprobante.porcion).toBe("total");
    expect(comprobante.fchServDesde).toBeNull();
    expect(comprobante.fchServHasta).toBeNull();
    expect(comprobante.fchVtoPago).toBeNull();
  });

  test("las tres fechas de servicio aceptan formato ARCA `AAAAMMDD`", async () => {
    const { event, choreography } = await seedInscription(
      `fechas.${crypto.randomUUID()}@example.com`,
    );

    const [comprobante] = await db
      .insert(comprobantes)
      .values({
        ...facturaCValues({
          choreographyId: choreography.id,
          eventId: event.id,
          cbteNro: 1,
        }),
        porcion: "saldo",
        fchServDesde: "20260801",
        fchServHasta: "20260803",
        fchVtoPago: "20260722",
      })
      .returning();

    expect(comprobante.porcion).toBe("saldo");
    expect(comprobante.fchServDesde).toBe("20260801");
    expect(comprobante.fchServHasta).toBe("20260803");
    expect(comprobante.fchVtoPago).toBe("20260722");
  });
});

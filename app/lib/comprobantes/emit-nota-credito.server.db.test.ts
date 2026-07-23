import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
} from "@arcasdk/core";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations, payments } from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import {
  ArcaClient,
  type ArcaBillingPort,
} from "@/lib/comprobantes/arca/client.server";
import type { ArcaVoucher } from "@/lib/comprobantes/arca/factura-c";
import {
  facturaCAprobada,
  facturaCRechazada,
  notaCreditoCAprobada,
  ultimoAutorizado,
  ultimoNotaCreditoAutorizado,
} from "@/lib/comprobantes/arca/fixtures";
import {
  listChoreographyComprobantes,
  recordComprobante,
} from "@/lib/comprobantes/comprobantes.server";
import { emitChoreographyFacturaC } from "@/lib/comprobantes/emit-factura-c.server";
import {
  annulComprobante,
  type NotaCreditoEmissionOutcome,
} from "@/lib/comprobantes/emit-nota-credito.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// WSFEv1 mockeado: por defecto la consulta del último devuelve la serie tipo 13
// y la emisión aprueba una Nota de crédito. Cada test sobrescribe lo que necesite.
function fakeBilling(
  overrides: Partial<ArcaBillingPort> = {},
): ArcaBillingPort {
  return {
    getLastVoucher: vi.fn(
      async (): Promise<LastVoucherResultDto> => ultimoNotaCreditoAutorizado,
    ),
    createVoucher: vi.fn(
      async (): Promise<CreateVoucherResultDto> => notaCreditoCAprobada,
    ),
    ...overrides,
  };
}

// Respuesta aprobada de una Nota de crédito con el correlativo dado, para
// distinguir eslabones de una cadena sin colisionar en (ptoVta, tipo, número).
function approvedNotaCredito(cbteNro: number): CreateVoucherResultDto {
  const cae = `4112459999${String(cbteNro).padStart(4, "0")}`;
  return {
    cae,
    caeFchVto: "20260801",
    response: {
      FeCabResp: { Resultado: "A", CbteTipo: 13 },
      FeDetResp: {
        FECAEDetResponse: [
          {
            CbteDesde: cbteNro,
            CbteHasta: cbteNro,
            CbteFch: "20260722",
            Resultado: "A",
            CAE: cae,
            CAEFchVto: "20260801",
          },
        ],
      },
    },
  };
}

function lastNotaCredito(cbteNro: number): LastVoucherResultDto {
  return { cbteNro, cbteTipo: 13, ptoVta: 1 };
}

function annulDeps(billing: ArcaBillingPort) {
  return {
    billing,
    client: new ArcaClient(billing),
    ptoVta: 1,
    issuerCuit: "30717611590",
    receptorIvaConditionId: 5,
    cbteFch: "20260722",
  };
}

async function seedChoreographyWithInscription(email: string) {
  const event = await createEventRecord({ active: true });
  const academy = await createAcademyRecord({
    academyName: "Academia Anulación",
    email,
  });
  const catalog = await createEventCatalog(event.id);
  const choreography = await createChoreographyRecord({
    academyId: academy.id,
    eventId: event.id,
    modalityId: catalog.modality.id,
    scheduleCapacityId: catalog.scheduleCapacity.id,
    name: "Coreografía a anular",
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

let paymentNumber = 0;

async function allocatePayment(input: {
  academyId: string;
  eventId: string;
  inscriptionId: string;
  amount: number;
}) {
  paymentNumber += 1;
  const [payment] = await db
    .insert(payments)
    .values({
      eventId: input.eventId,
      academyId: input.academyId,
      paymentNumber,
      paymentDate: "2026-07-22",
      amount: input.amount,
      paymentMethod: "transferencia",
    })
    .returning();

  await db.insert(paymentAllocations).values({
    paymentId: payment.id,
    inscriptionId: input.inscriptionId,
    academyId: input.academyId,
    eventId: input.eventId,
    allocationType: "deposit",
    amount: input.amount,
  });
}

async function recordFactura(input: {
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
  amount: number;
  cbteNro: number;
}) {
  return await recordComprobante({
    choreographyId: input.choreographyId,
    eventId: input.eventId,
    cbteTipo: 11,
    ptoVta: 1,
    cbteNro: input.cbteNro,
    cbteFch: "20260701",
    impTotal: input.amount,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "40000000000000",
    caeVto: "20260710",
    lines: [{ inscriptionId: input.inscriptionId, amount: input.amount }],
  });
}

function expectOk(
  outcome: NotaCreditoEmissionOutcome,
): asserts outcome is Extract<NotaCreditoEmissionOutcome, { ok: true }> {
  expect(outcome.ok).toBe(true);
}

describe("annulComprobante", () => {
  test("emite una Nota de crédito espejo tipo 13 con CbtesAsoc y anula el original", async () => {
    const { academy, choreography, inscription } =
      await seedChoreographyWithInscription(
        `anula.${crypto.randomUUID()}@example.com`,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 7000,
    });
    const factura = await recordFactura({
      choreographyId: choreography.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 7000,
      cbteNro: 43,
    });

    const deps = annulDeps(fakeBilling());
    const outcome = await annulComprobante({ comprobanteId: factura.id }, deps);

    expectOk(outcome);

    // Correlativo de la serie tipo 13 (último 7 → 8) y CbtesAsoc al original.
    expect(deps.billing.getLastVoucher).toHaveBeenCalledWith(1, 13);
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    expect(sent.CbteTipo).toBe(13);
    expect(sent.CbteDesde).toBe(8);
    expect(sent.ImpTotal).toBe(7000);
    expect(sent.CbtesAsoc).toEqual([
      {
        Tipo: 11,
        PtoVta: 1,
        Nro: 43,
        Cuit: "30717611590",
        CbteFch: "20260701",
      },
    ]);

    const rows = await listChoreographyComprobantes(choreography.id);
    const facturaRow = rows.find((row) => row.id === factura.id);
    const notaCredito = rows.find((row) => row.cbteTipo === 13);
    // El original queda anulado; la Nota de crédito, vigente y asociada.
    expect(facturaRow?.status).toBe("anulada");
    expect(notaCredito).toMatchObject({
      cbteTipo: 13,
      cbteNro: 8,
      impTotal: 7000,
      issuerIvaCondition: "exento",
      associatedComprobanteId: factura.id,
      status: "vigente",
    });
  });

  test("la Nota de crédito replica las líneas internas del comprobante anulado", async () => {
    const { academy, choreography, inscription } =
      await seedChoreographyWithInscription(
        `lineas.${crypto.randomUUID()}@example.com`,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 5000,
    });
    const factura = await recordFactura({
      choreographyId: choreography.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 5000,
      cbteNro: 44,
    });

    const outcome = await annulComprobante(
      { comprobanteId: factura.id },
      annulDeps(fakeBilling()),
    );

    expectOk(outcome);
    const rows = await listChoreographyComprobantes(choreography.id);
    const notaCredito = rows.find((row) => row.cbteTipo === 13);
    expect(notaCredito?.lines).toHaveLength(1);
    expect(notaCredito?.lines[0]).toMatchObject({
      inscriptionId: inscription.id,
      amount: 5000,
    });
  });

  test("no permite anular dos veces el mismo comprobante", async () => {
    const { academy, choreography, inscription } =
      await seedChoreographyWithInscription(
        `doble.${crypto.randomUUID()}@example.com`,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 3000,
    });
    const factura = await recordFactura({
      choreographyId: choreography.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 3000,
      cbteNro: 45,
    });

    const first = await annulComprobante(
      { comprobanteId: factura.id },
      annulDeps(fakeBilling()),
    );
    expectOk(first);

    const billing = fakeBilling();
    const second = await annulComprobante(
      { comprobanteId: factura.id },
      annulDeps(billing),
    );

    expect(second).toMatchObject({ ok: false, reason: "already-annulled" });
    // No se emitió una segunda Nota de crédito.
    expect(billing.createVoucher).not.toHaveBeenCalled();
    const rows = await listChoreographyComprobantes(choreography.id);
    expect(rows.filter((row) => row.cbteTipo === 13)).toHaveLength(1);
  });

  // La guarda `already-annulled` del test anterior es a nivel aplicación: lee
  // estado derivado y recién después hace el round-trip a ARCA, que no es
  // transaccional. Dos anulaciones concurrentes podrían pasar ambas la guarda.
  // El índice único sobre `associated_comprobante_id` es la red de contención:
  // la segunda escritura falla en vez de dejar dos Notas de crédito espejo
  // válidas y el estado derivado ambiguo.
  test("la base rechaza una segunda Nota de crédito contra el mismo comprobante", async () => {
    const { academy, choreography, inscription } =
      await seedChoreographyWithInscription(
        `carrera.${crypto.randomUUID()}@example.com`,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 3000,
    });
    const factura = await recordFactura({
      choreographyId: choreography.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 3000,
      cbteNro: 60,
    });

    expectOk(
      await annulComprobante(
        { comprobanteId: factura.id },
        annulDeps(fakeBilling()),
      ),
    );

    // Escritura directa, saltando la guarda de aplicación: simula el perdedor de
    // la carrera, que ya emitió su Nota de crédito en ARCA (correlativo distinto,
    // así que no choca con el índice de numeración) y llega a persistirla.
    await expect(
      recordComprobante({
        choreographyId: choreography.id,
        eventId: choreography.eventId,
        cbteTipo: 13,
        ptoVta: 1,
        cbteNro: 999,
        cbteFch: "20260722",
        impTotal: 3000,
        issuerCuit: "30717611590",
        issuerIvaCondition: "exento",
        receptorDocTipo: 99,
        receptorDocNro: "0",
        receptorIvaConditionId: 5,
        cae: "41124599990999",
        caeVto: "20260801",
        associatedComprobanteId: factura.id,
        lines: [{ inscriptionId: inscription.id, amount: 3000 }],
      }),
    ).rejects.toThrow();

    const rows = await listChoreographyComprobantes(choreography.id);
    expect(rows.filter((row) => row.cbteTipo === 13)).toHaveLength(1);
  });

  // Contracara del test anterior: el índice es único pero la columna es
  // nullable, y Postgres trata los NULL como distintos. Varias facturas vigentes
  // (todas con `associatedComprobanteId` null) conviven sin colisionar.
  test("varias facturas vigentes conviven bajo el índice único", async () => {
    const { choreography, inscription } = await seedChoreographyWithInscription(
      `vigentes.${crypto.randomUUID()}@example.com`,
    );

    for (const cbteNro of [70, 71, 72]) {
      await recordFactura({
        choreographyId: choreography.id,
        eventId: choreography.eventId,
        inscriptionId: inscription.id,
        amount: 1000,
        cbteNro,
      });
    }

    const rows = await listChoreographyComprobantes(choreography.id);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === "vigente")).toBe(true);
  });

  test("un rechazo de ARCA no persiste la Nota de crédito ni anula el original", async () => {
    const { academy, choreography, inscription } =
      await seedChoreographyWithInscription(
        `rechazo.${crypto.randomUUID()}@example.com`,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 4000,
    });
    const factura = await recordFactura({
      choreographyId: choreography.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 4000,
      cbteNro: 46,
    });

    const outcome = await annulComprobante(
      { comprobanteId: factura.id },
      annulDeps(
        fakeBilling({ createVoucher: vi.fn(async () => facturaCRechazada) }),
      ),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("rejected");
      expect(outcome.arca?.errors[0]?.code).toBe(10016);
    }
    const rows = await listChoreographyComprobantes(choreography.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("vigente");
  });

  test("rechaza un comprobante inexistente", async () => {
    const billing = fakeBilling();
    const outcome = await annulComprobante(
      { comprobanteId: crypto.randomUUID() },
      annulDeps(billing),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "not-found" });
    expect(billing.getLastVoucher).not.toHaveBeenCalled();
  });

  test("admite una cadena ilimitada: re-facturar el remanente liberado y re-anular", async () => {
    const { academy, choreography, inscription } =
      await seedChoreographyWithInscription(
        `cadena.${crypto.randomUUID()}@example.com`,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 6000,
    });
    const factura = await recordFactura({
      choreographyId: choreography.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 6000,
      cbteNro: 50,
    });

    // 1) Anular la primera factura.
    const firstAnnul = await annulComprobante(
      { comprobanteId: factura.id },
      annulDeps(fakeBilling()),
    );
    expectOk(firstAnnul);

    // 2) El remanente vuelve a ser facturable → emitir una segunda factura.
    const reemit = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
      annulDeps(
        fakeBilling({
          getLastVoucher: vi.fn(async () => ultimoAutorizado),
          createVoucher: vi.fn(async () => facturaCAprobada),
        }),
      ),
    );
    expect(reemit.ok).toBe(true);
    if (!reemit.ok) return;

    // 3) Anular también la segunda factura: la cadena crece sin límite. La
    // segunda Nota de crédito corre al siguiente correlativo de su serie.
    const secondAnnul = await annulComprobante(
      { comprobanteId: reemit.comprobante.id },
      annulDeps(
        fakeBilling({
          getLastVoucher: vi.fn(async () => lastNotaCredito(8)),
          createVoucher: vi.fn(async () => approvedNotaCredito(9)),
        }),
      ),
    );
    expectOk(secondAnnul);

    const rows = await listChoreographyComprobantes(choreography.id);
    // Cuatro filas: 2 facturas + 2 notas de crédito, todas imborrables.
    expect(rows).toHaveLength(4);
    const facturas = rows.filter((row) => row.cbteTipo === 11);
    const notas = rows.filter((row) => row.cbteTipo === 13);
    expect(facturas).toHaveLength(2);
    expect(notas).toHaveLength(2);
    // Ambas facturas quedaron anuladas por su Nota de crédito respectiva.
    expect(facturas.every((row) => row.status === "anulada")).toBe(true);
    // Cada Nota de crédito referencia a una factura distinta.
    expect(new Set(notas.map((row) => row.associatedComprobanteId)).size).toBe(
      2,
    );
  });
});

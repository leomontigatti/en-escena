import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers } from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import { type ArcaBillingPort } from "@/lib/comprobantes/arca/client.server";
import type { ArcaVoucher } from "@/lib/comprobantes/arca/factura-c";
import {
  facturaCAprobada,
  facturaCRechazada,
  notaCreditoCAprobada,
  notaCreditoCConsultada,
  ultimoAutorizado,
  ultimoNotaCreditoAutorizado,
} from "@/lib/comprobantes/arca/wsfe-responses.test-support";
import {
  listAnchorComprobantes,
  recordComprobante,
} from "@/lib/comprobantes/comprobantes.server";
import { emitFacturaC } from "@/lib/comprobantes/emit-factura-c.server";
import {
  annulComprobante,
  type NotaCreditoEmissionOutcome,
} from "@/lib/comprobantes/emit-nota-credito.server";

import {
  allocatePayment,
  connectionLost,
  emissionDeps,
  fakeBilling,
} from "@/lib/comprobantes/comprobante-emission.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";

installDatabaseTestHooks();

// Mocked WSFEv1: by default the last-number lookup returns the type 13 series
// and emission approves a credit note. Each test overrides what it needs.
// The type 13 series: ARCA approving the credit note that follows
// `ultimoNotaCreditoAutorizado`.
function fakeNotaCreditoBilling(
  overrides: Partial<ArcaBillingPort> = {},
): ArcaBillingPort {
  return fakeBilling({
    getLastVoucher: vi.fn(
      async (): Promise<LastVoucherResultDto> => ultimoNotaCreditoAutorizado,
    ),
    createVoucher: vi.fn(
      async (): Promise<CreateVoucherResultDto> => notaCreditoCAprobada,
    ),
    ...overrides,
  });
}

// An approved credit note response with the given sequence number, to tell
// links of a chain apart without colliding on (ptoVta, type, number).
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
    categoryId: catalog.categoryWithoutLevel.id,
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

async function recordFactura(input: {
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
  amount: number;
  cbteNro: number;
  // Optional service dates: comprobantes emitted after ADR-0011 carry them
  // (Concepto 2); the old seed does not (Concepto 1). The credit note
  // mirrors whatever the original has.
  fchServDesde?: string;
  fchServHasta?: string;
  fchVtoPago?: string;
}) {
  return await recordComprobante({
    anchor: choreographyAnchor(input.choreographyId),
    eventId: input.eventId,
    cbteTipo: 11,
    ptoVta: 1,
    cbteNro: input.cbteNro,
    cbteFch: "20260701",
    impTotal: input.amount,
    fchServDesde: input.fchServDesde ?? null,
    fchServHasta: input.fchServHasta ?? null,
    fchVtoPago: input.fchVtoPago ?? null,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "40000000000000",
    caeVto: "20260710",
    lines: [
      { choreographyInscriptionId: input.inscriptionId, amount: input.amount },
    ],
  });
}

function expectOk(
  outcome: NotaCreditoEmissionOutcome,
): asserts outcome is Extract<NotaCreditoEmissionOutcome, { ok: true }> {
  expect(outcome.ok).toBe(true);
}

describe("annulComprobante", () => {
  test("emits a mirror type 13 credit note with CbtesAsoc and annuls the original", async () => {
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

    const deps = emissionDeps(fakeNotaCreditoBilling());
    const outcome = await annulComprobante({ comprobanteId: factura.id }, deps);

    expectOk(outcome);
    expect(outcome.recovered).toBe(false);

    // Type 13 series sequence number (last 7 → 8) and CbtesAsoc to the original.
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

    const rows = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    const facturaRow = rows.find((row) => row.id === factura.id);
    const notaCredito = rows.find((row) => row.cbteTipo === 13);
    // The original ends up annulled; the credit note, in force and associated.
    expect(facturaRow?.status).toBe("annulled");
    expect(notaCredito).toMatchObject({
      cbteTipo: 13,
      cbteNro: 8,
      impTotal: 7000,
      issuerIvaCondition: "exento",
      associatedComprobanteId: factura.id,
      status: "valid",
    });
  });

  test("the credit note resends the service dates of the comprobante it annuls", async () => {
    // Regression (10049): emission is always Concepto 2, so the NC must forward
    // the three dates of the comprobante it annuls. It used to go out as Concepto
    // 2 with no dates and ARCA rejected it.
    const { academy, choreography, inscription } =
      await seedChoreographyWithInscription(
        `concepto2.${crypto.randomUUID()}@example.com`,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 8000,
    });
    const factura = await recordFactura({
      choreographyId: choreography.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 8000,
      cbteNro: 80,
      fchServDesde: "20261010",
      fchServHasta: "20261031",
      fchVtoPago: "20260723",
    });

    const deps = emissionDeps(fakeNotaCreditoBilling());
    expectOk(await annulComprobante({ comprobanteId: factura.id }, deps));

    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    expect(sent.Concepto).toBe(2);
    expect(sent.FchServDesde).toBe("20261010");
    expect(sent.FchServHasta).toBe("20261031");
    expect(sent.FchVtoPago).toBe("20260723");
  });

  test("the credit note replicates the internal lines of the annulled comprobante", async () => {
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
      emissionDeps(fakeNotaCreditoBilling()),
    );

    expectOk(outcome);
    const rows = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    const notaCredito = rows.find((row) => row.cbteTipo === 13);
    expect(notaCredito?.lines).toHaveLength(1);
    expect(notaCredito?.lines[0]).toMatchObject({
      choreographyInscriptionId: inscription.id,
      amount: 5000,
    });
  });

  test("does not allow annulling the same comprobante twice", async () => {
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
      emissionDeps(fakeNotaCreditoBilling()),
    );
    expectOk(first);

    const billing = fakeNotaCreditoBilling();
    const second = await annulComprobante(
      { comprobanteId: factura.id },
      emissionDeps(billing),
    );

    expect(second).toMatchObject({ ok: false, reason: "already-annulled" });
    // No second credit note was emitted.
    expect(billing.createVoucher).not.toHaveBeenCalled();
    const rows = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(rows.filter((row) => row.cbteTipo === 13)).toHaveLength(1);
  });

  // The previous test's `already-annulled` guard is application-level: it reads
  // derived state and only then makes the round trip to ARCA, which is not
  // transactional. Two concurrent annulments could both get past the guard. The
  // unique index on `associated_comprobante_id` is the safety net: the second
  // write fails instead of leaving two valid mirror credit notes and an
  // ambiguous derived state.
  //
  // Nothing here is run concurrently: the loser of the race is simulated with a
  // direct write after the winner has committed, which is what makes the index
  // observable on either backend. The test needs no gate on `DB_TEST_BACKEND`.
  test("the database rejects a second credit note against the same comprobante", async () => {
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
        emissionDeps(fakeNotaCreditoBilling()),
      ),
    );

    // A direct write, skipping the application guard: it simulates the loser of
    // the race, which already emitted its credit note in ARCA (a different
    // sequence number, so it does not clash with the numbering index) and gets as
    // far as persisting it.
    await expect(
      recordComprobante({
        anchor: choreographyAnchor(choreography.id),
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
        lines: [{ choreographyInscriptionId: inscription.id, amount: 3000 }],
      }),
    ).rejects.toThrow();

    const rows = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(rows.filter((row) => row.cbteTipo === 13)).toHaveLength(1);
  });

  // The flip side of the previous test: the index is unique but the column is
  // nullable, and Postgres treats NULLs as distinct. Several comprobantes in
  // force (all with a null `associatedComprobanteId`) coexist without colliding.
  test("several live invoices coexist under the unique index", async () => {
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

    const rows = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === "valid")).toBe(true);
  });

  test("an ARCA rejection persists no credit note and does not annul the original", async () => {
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
      emissionDeps(
        fakeNotaCreditoBilling({
          createVoucher: vi.fn(async () => facturaCRechazada),
        }),
      ),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("rejected");
      expect(outcome.arca?.errors[0]?.code).toBe(10016);
    }
    const rows = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("valid");
  });

  test("rejects a comprobante that does not exist", async () => {
    const billing = fakeNotaCreditoBilling();
    const outcome = await annulComprobante(
      { comprobanteId: crypto.randomUUID() },
      emissionDeps(billing),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "not-found" });
    expect(billing.getLastVoucher).not.toHaveBeenCalled();
  });

  test("supports an unbounded chain: re-invoice the released remainder and re-annul", async () => {
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

    // 1) Annul the first `Factura C`.
    const firstAnnul = await annulComprobante(
      { comprobanteId: factura.id },
      emissionDeps(fakeNotaCreditoBilling()),
    );
    expectOk(firstAnnul);

    // 2) The remainder becomes billable again → emit a second invoice.
    const reemit = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      emissionDeps(
        fakeNotaCreditoBilling({
          getLastVoucher: vi.fn(async () => ultimoAutorizado),
          createVoucher: vi.fn(async () => facturaCAprobada),
        }),
      ),
    );
    expect(reemit.ok).toBe(true);
    if (!reemit.ok) return;

    // 3) Annul the second invoice too: the chain grows without limit. The second
    // credit note runs at the next sequence number of its series.
    const secondAnnul = await annulComprobante(
      { comprobanteId: reemit.comprobante.id },
      emissionDeps(
        fakeNotaCreditoBilling({
          getLastVoucher: vi.fn(async () => lastNotaCredito(8)),
          createVoucher: vi.fn(async () => approvedNotaCredito(9)),
        }),
      ),
    );
    expectOk(secondAnnul);

    const rows = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    // Four rows: 2 invoices + 2 credit notes, all undeletable.
    expect(rows).toHaveLength(4);
    const facturas = rows.filter((row) => row.cbteTipo === 11);
    const notas = rows.filter((row) => row.cbteTipo === 13);
    expect(facturas).toHaveLength(2);
    expect(notas).toHaveLength(2);
    // Both invoices ended up annulled by their respective credit note.
    expect(facturas.every((row) => row.status === "annulled")).toBe(true);
    // Each credit note references a different invoice.
    expect(new Set(notas.map((row) => row.associatedComprobanteId)).size).toBe(
      2,
    );
  });
});

// ARCA does not respond during the annulment (ADR-0012): the same classification
// by phase and the same recovery by lookup as emission, against the type 13
// series.
describe("annulComprobante (ARCA does not respond)", () => {
  // A choreography with a comprobante of 4000 in force, ready to annul. The
  // credit note to attempt is number 8 (`ultimoNotaCreditoAutorizado` = 7).
  async function seedValidInvoice(prefix: string) {
    const { academy, choreography, inscription } =
      await seedChoreographyWithInscription(
        `${prefix}.${crypto.randomUUID()}@example.com`,
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

    return { choreography, factura };
  }

  // `FECompConsultar` for credit note 8 as ARCA recorded it.
  function consultada(
    overrides: Partial<VoucherInfoResultDto> = {},
  ): VoucherInfoResultDto {
    return {
      ...notaCreditoCConsultada,
      cbteDesde: 8,
      cbteHasta: 8,
      impTotal: 4000,
      cbteFch: "20260722",
      ...overrides,
    };
  }

  test("with authorization cut off, it queries the exact type 13 credit note and persists it with the returned CAE", async () => {
    const { choreography, factura } = await seedValidInvoice("recuperada");
    const billing = fakeNotaCreditoBilling({
      createVoucher: vi.fn(connectionLost),
      getVoucherInfo: vi.fn(async () => consultada()),
    });

    const outcome = await annulComprobante(
      { comprobanteId: factura.id },
      emissionDeps(billing),
    );

    expect(billing.getVoucherInfo).toHaveBeenCalledWith(8, 1, 13);
    expectOk(outcome);
    // The CAE came from the lookup, not from the authorization.
    expect(outcome.recovered).toBe(true);
    expect(outcome.notaCredito).toMatchObject({
      cbteTipo: 13,
      cbteNro: 8,
      impTotal: 4000,
      cae: "41124599990011",
      associatedComprobanteId: factura.id,
    });
    // The original ended up annulled, just as on the happy path.
    const rows = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(rows.find((row) => row.id === factura.id)?.status).toBe("annulled");
  });
});

import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import type {
  CreateVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  comprobantes,
  paymentAllocations,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import {
  type ArcaBillingPort,
  type ArcaTimeouts,
} from "@/lib/comprobantes/arca/client.server";
import type { ArcaVoucher } from "@/lib/comprobantes/arca/factura-c";
import {
  facturaCAprobada,
  facturaCConsultada,
  facturaCRechazada,
} from "@/lib/comprobantes/arca/wsfe-responses.test-support";
import {
  emitFacturaC,
  recheckFacturaC,
} from "@/lib/comprobantes/emit-factura-c.server";
import {
  listAnchorComprobantes,
  recordComprobante,
} from "@/lib/comprobantes/comprobantes.server";

import {
  allocatePayment,
  connectionLost,
  emissionDeps,
  FAST_TIMEOUTS,
  fakeBilling,
  neverAnswers,
} from "@/lib/comprobantes/comprobante-emission.test-support";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../tests/db/harness";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";

installDatabaseTestHooks();

// Every inscription ends up with a 3000 `Seña` and a 10000 total — the `solo`
// priced at 10000 and the 30% the event requires. The price is repeated with a
// far-off deadline because the threshold comes from the price applicable TODAY,
// and the catalogue's one expires in 2026.
async function seedChoreographyWithInscriptions(
  email: string,
  inscriptionCount: number,
) {
  const event = await createEventRecord({ active: true });
  const academy = await createAcademyRecord({
    academyName: "Academia Emisión",
    email,
  });
  const catalog = await createEventCatalog(event.id);
  await insertTestPrices([
    {
      eventId: event.id,
      name: "Precio Solo vigente",
      groupType: "solo",
      amount: 10000,
      paymentDeadline: "2099-12-31",
    },
  ]);
  const choreography = await createChoreographyRecord({
    academyId: academy.id,
    eventId: event.id,
    modalityId: catalog.modality.id,
    categoryId: catalog.categoryWithoutLevel.id,
    scheduleCapacityId: catalog.scheduleCapacity.id,
    name: "Coreografía a facturar",
  });

  const inscriptions = [];
  for (let index = 0; index < inscriptionCount; index++) {
    const dancer = await createDancer(academy.id);
    const [inscription] = await db
      .insert(choreographyDancers)
      .values({
        choreographyId: choreography.id,
        dancerId: dancer.id,
        ageAtEventStart: 14,
      })
      .returning();
    inscriptions.push(inscription);
  }

  return { event, academy, choreography, inscriptions };
}

describe("emitFacturaC", () => {
  test("derives CbteNro from FECompUltimoAutorizado + 1 and invoices what was collected", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `emision.${crypto.randomUUID()}@example.com`,
        2,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 6000,
    });
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[1].id,
      amount: 4000,
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      deps,
    );

    expect(deps.billing.getLastVoucher).toHaveBeenCalledWith(1, 11);
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    // ultimoAutorizado.cbteNro = 42 → siguiente 43.
    expect(sent.CbteDesde).toBe(43);
    expect(sent.CbteTipo).toBe(11);
    expect(sent.ImpTotal).toBe(10000);

    expect(outcome).toMatchObject({ ok: true, recovered: false });
    const [persisted] = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(persisted).toMatchObject({
      cbteTipo: 11,
      cbteNro: 43,
      impTotal: 10000,
      issuerIvaCondition: "exento",
      receptorDocTipo: 99,
      receptorDocNro: "0",
      receptorIvaConditionId: 5,
      cae: "41124578989845",
      status: "valid",
    });
    expect(
      [...persisted.lines].map((line) => line.amount).sort((a, b) => a - b),
    ).toEqual([4000, 6000]);
  });

  test("does not re-invoice amounts already covered by a live type 11 invoice", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `parcial.${crypto.randomUUID()}@example.com`,
        1,
      );
    const inscription = inscriptions[0];
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 10000,
    });
    // There is already a `Factura C` in force covering 6000 of the inscription.
    await recordComprobante({
      anchor: choreographyAnchor(choreography.id),
      eventId: choreography.eventId,
      cbteTipo: 11,
      ptoVta: 1,
      cbteNro: 40,
      cbteFch: "20260701",
      impTotal: 6000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      receptorDocTipo: 99,
      receptorDocNro: "0",
      receptorIvaConditionId: 5,
      cae: "40000000000000",
      caeVto: "20260710",
      lines: [{ choreographyInscriptionId: inscription.id, amount: 6000 }],
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      deps,
    );

    expect(outcome.ok).toBe(true);
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    // Only the unbilled remainder: 10000 − 6000.
    expect(sent.ImpTotal).toBe(4000);

    const comprobantes = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    const nuevo = comprobantes.find((row) => row.cbteNro === 43);
    expect(nuevo?.impTotal).toBe(4000);
    expect(nuevo?.lines[0]?.amount).toBe(4000);
  });

  test("there is nothing to invoice when what was collected is already covered", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `cubierto.${crypto.randomUUID()}@example.com`,
        1,
      );
    const inscription = inscriptions[0];
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 8000,
    });
    await recordComprobante({
      anchor: choreographyAnchor(choreography.id),
      eventId: choreography.eventId,
      cbteTipo: 11,
      ptoVta: 1,
      cbteNro: 40,
      cbteFch: "20260701",
      impTotal: 8000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      receptorDocTipo: 99,
      receptorDocNro: "0",
      receptorIvaConditionId: 5,
      cae: "40000000000000",
      caeVto: "20260710",
      lines: [{ choreographyInscriptionId: inscription.id, amount: 8000 }],
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      deps,
    );

    expect(outcome).toMatchObject({ ok: false, reason: "nothing-to-bill" });
    expect(deps.billing.createVoucher).not.toHaveBeenCalled();
  });

  test("there is nothing to invoice with no payments", async () => {
    const { choreography } = await seedChoreographyWithInscriptions(
      `sincobro.${crypto.randomUUID()}@example.com`,
      1,
    );

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      deps,
    );

    expect(outcome).toMatchObject({ ok: false, reason: "nothing-to-bill" });
    expect(deps.billing.createVoucher).not.toHaveBeenCalled();
  });

  test("an ARCA rejection persists no comprobante and does not alter the financial status", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `rechazo.${crypto.randomUUID()}@example.com`,
        1,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 5000,
    });

    const deps = emissionDeps(
      fakeBilling({
        createVoucher: vi.fn(async () => facturaCRechazada),
      }),
    );
    const outcome = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      deps,
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("rejected");
      expect(outcome.arca?.errors[0]?.code).toBe(10016);
    }

    // No comprobante was persisted.
    expect(
      await listAnchorComprobantes(choreographyAnchor(choreography.id)),
    ).toHaveLength(0);
    // The financial state (payment allocations) is left intact.
    const allocations = await db
      .select()
      .from(paymentAllocations)
      .where(
        eq(paymentAllocations.choreographyInscriptionId, inscriptions[0].id),
      );
    expect(allocations).toHaveLength(1);
    expect(allocations[0].amount).toBe(5000);
  });

  test("an annulled invoice does not count as invoiced: its amount becomes invoiceable again", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `anulada.${crypto.randomUUID()}@example.com`,
        1,
      );
    const inscription = inscriptions[0];
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 7000,
    });
    const factura = await recordComprobante({
      anchor: choreographyAnchor(choreography.id),
      eventId: choreography.eventId,
      cbteTipo: 11,
      ptoVta: 1,
      cbteNro: 40,
      cbteFch: "20260701",
      impTotal: 7000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      receptorDocTipo: 99,
      receptorDocNro: "0",
      receptorIvaConditionId: 5,
      cae: "40000000000000",
      caeVto: "20260710",
      lines: [{ choreographyInscriptionId: inscription.id, amount: 7000 }],
    });
    // Mirror credit note annulling the previous invoice.
    await recordComprobante({
      anchor: choreographyAnchor(choreography.id),
      eventId: choreography.eventId,
      cbteTipo: 13,
      ptoVta: 1,
      cbteNro: 41,
      cbteFch: "20260702",
      impTotal: 7000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      receptorDocTipo: 99,
      receptorDocNro: "0",
      receptorIvaConditionId: 5,
      cae: "41000000000000",
      caeVto: "20260711",
      associatedComprobanteId: factura.id,
      lines: [{ choreographyInscriptionId: inscription.id, amount: 7000 }],
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      deps,
    );

    expect(outcome.ok).toBe(true);
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    expect(sent.ImpTotal).toBe(7000);
  });

  test("freezes the event's service dates", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `sena.${crypto.randomUUID()}@example.com`,
        1,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 3000,
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      deps,
    );

    expect(outcome.ok).toBe(true);
    // The builder receives Concepto 2 with the event's period and the due date on
    // the comprobante's date.
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    expect(sent.Concepto).toBe(2);
    expect(sent.FchServDesde).toBe("20260501");
    expect(sent.FchServHasta).toBe("20260503");
    expect(sent.FchVtoPago).toBe("20260722");

    const [persisted] = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(persisted).toMatchObject({
      fchServDesde: "20260501",
      fchServHasta: "20260503",
      fchVtoPago: "20260722",
    });
  });

  test("a fully collected, never invoiced choreography emits a single comprobante", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `total.${crypto.randomUUID()}@example.com`,
        1,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 3000,
    });
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 7000,
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      deps,
    );

    expect(outcome.ok).toBe(true);
    const comprobantes = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(comprobantes).toHaveLength(1);
    expect(comprobantes[0]).toMatchObject({ impTotal: 10000 });
  });

  test("emits one inscription's remainder even when another has an orphaned invoiced line", async () => {
    // The state `porcion` used to block: A's allocation is deleted after its
    // line was billed, so the aggregate billed (3000) exceeds the aggregate
    // collected (1000) while B still has a remainder. The remainder is resolved
    // PER INSCRIPTION, so B's 1000 is billable and this emission is legitimate —
    // there is money collected that no valid invoice covers. The loader's
    // `canEmit` asserts the same state in
    // `choreography-detail/server.invoicing.db.test.ts`; this is the server side
    // of that pair, and what makes the two agree an assertion rather than a
    // coincidence.
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `huerfana.${crypto.randomUUID()}@example.com`,
        2,
      );
    const [inscriptionA, inscriptionB] = inscriptions;
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptionA.id,
      amount: 3000,
    });
    await recordComprobante({
      anchor: choreographyAnchor(choreography.id),
      eventId: choreography.eventId,
      cbteTipo: 11,
      ptoVta: 1,
      cbteNro: 40,
      cbteFch: "20260701",
      impTotal: 3000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      receptorDocTipo: 99,
      receptorDocNro: "0",
      receptorIvaConditionId: 5,
      cae: "40000000000000",
      caeVto: "20260710",
      lines: [{ choreographyInscriptionId: inscriptionA.id, amount: 3000 }],
    });
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptionB.id,
      amount: 1000,
    });
    await db
      .delete(paymentAllocations)
      .where(eq(paymentAllocations.choreographyInscriptionId, inscriptionA.id));

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      deps,
    );

    expect(outcome.ok).toBe(true);
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    expect(sent.ImpTotal).toBe(1000);
    const nuevo = (
      await listAnchorComprobantes(choreographyAnchor(choreography.id))
    ).find((row) => row.cbteNro === 43);
    expect(nuevo).toMatchObject({ impTotal: 1000 });
    // Only B's remainder is billed: A's orphaned line is not re-billed.
    expect(nuevo?.lines.map((line) => line.amount)).toEqual([1000]);
  });

  test("reallocating a payment after emission does not alter the frozen dates", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `congela.${crypto.randomUUID()}@example.com`,
        1,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 3000,
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
      },
      deps,
    );
    expect(outcome.ok).toBe(true);
    const emitted = outcome.ok ? outcome.comprobante : null;

    // Months later a further collection lands (a reallocation is one way to get
    // there): the already emitted comprobante must not change its dates.
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 7000,
    });

    const [reloaded] = await db
      .select({
        fchServDesde: comprobantes.fchServDesde,
        fchServHasta: comprobantes.fchServHasta,
        fchVtoPago: comprobantes.fchVtoPago,
      })
      .from(comprobantes)
      .where(eq(comprobantes.id, emitted!.id));
    expect(reloaded).toEqual({
      fchServDesde: "20260501",
      fchServHasta: "20260503",
      fchVtoPago: "20260722",
    });
  });

  test("rejects a choreography that does not exist or belongs to another event", async () => {
    const { choreography } = await seedChoreographyWithInscriptions(
      `evento.${crypto.randomUUID()}@example.com`,
      1,
    );

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      { anchor: choreographyAnchor(choreography.id), eventId: "otro-evento" },
      deps,
    );

    expect(outcome).toMatchObject({ ok: false, reason: "not-found" });
    expect(deps.billing.getLastVoucher).not.toHaveBeenCalled();
  });

  /**
   * The unit is serialised by a transaction-scoped advisory lock keyed on the
   * anchor, so two operators pressing `Emitir` at once do not each read the same
   * `collected − already billed` and each authorize a comprobante for it. The
   * second emission runs after the first has committed, sees the delta already
   * billed, and stops before ARCA.
   *
   * ARCA answers slowly on purpose: without the lock the second derivation would
   * land inside that window. That window only exists where the two emissions
   * really do overlap — under PGlite the single connection serialises the two
   * transactions on its own, so the assertion that a single comprobante exists
   * would hold even without the advisory lock. The test is therefore gated to
   * the Postgres backend instead of passing for free on the fast suite.
   */
  describe.skipIf(isPgliteTestBackend())(
    "comprobante emission under real contention",
    () => {
      test("serialises two concurrent emissions of one unit into a single comprobante", async () => {
        const { academy, choreography, inscriptions } =
          await seedChoreographyWithInscriptions(
            `concurrencia.${crypto.randomUUID()}@example.com`,
            1,
          );
        await allocatePayment({
          academyId: academy.id,
          eventId: choreography.eventId,
          inscriptionId: inscriptions[0].id,
          amount: 6000,
        });

        const deps = emissionDeps(
          fakeBilling({
            createVoucher: vi.fn(async (): Promise<CreateVoucherResultDto> => {
              await new Promise((resolve) => setTimeout(resolve, 50));

              return facturaCAprobada;
            }),
          }),
        );
        const emission = () =>
          emitFacturaC(
            {
              anchor: choreographyAnchor(choreography.id),
              eventId: choreography.eventId,
            },
            deps,
          );

        const outcomes = await Promise.all([emission(), emission()]);

        expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
        expect(outcomes.filter((outcome) => !outcome.ok)).toMatchObject([
          { ok: false, reason: "nothing-to-bill" },
        ]);
        expect(deps.billing.createVoucher).toHaveBeenCalledTimes(1);
        await expect(
          listAnchorComprobantes(choreographyAnchor(choreography.id)),
        ).resolves.toMatchObject([{ cbteNro: 43, impTotal: 6000 }]);
      });
    },
  );
});

// ARCA does not respond (ADR-0012): the failure is classified by phase and, if
// it was cut off while authorizing, the server resolves the ambiguity by
// querying the exact comprobante it tried to emit.
describe("emitFacturaC (ARCA does not respond)", () => {
  // A choreography with 5000 collected and nothing billed: the sequence number
  // to attempt is 43 (`ultimoAutorizado` = 42).
  async function seedCollectedChoreography(prefix: string) {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `${prefix}.${crypto.randomUUID()}@example.com`,
        1,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 5000,
    });
    return choreography;
  }

  // `FECompConsultar` for `Factura C` 43 as ARCA recorded it.
  function consultada(
    overrides: Partial<VoucherInfoResultDto> = {},
  ): VoucherInfoResultDto {
    return {
      ...facturaCConsultada,
      cbteDesde: 43,
      cbteHasta: 43,
      impTotal: 5000,
      cbteFch: "20260722",
      ...overrides,
    };
  }

  async function emitWith(
    choreographyId: string,
    eventId: string,
    billing: ArcaBillingPort,
    timeouts?: ArcaTimeouts,
  ) {
    const deps = emissionDeps(billing, timeouts);
    const outcome = await emitFacturaC(
      { anchor: choreographyAnchor(choreographyId), eventId },
      deps,
    );
    return { deps, outcome };
  }

  test("with authorization cut off, it queries the exact comprobante and persists it with the CAE ARCA returns", async () => {
    const choreography = await seedCollectedChoreography("recuperado");

    const { deps, outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({
        createVoucher: vi.fn(connectionLost),
        getVoucherInfo: vi.fn(async () => consultada()),
      }),
    );

    // The sales point, type and sequence number that were attempted get queried.
    expect(deps.billing.getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
    // The CAE came from the lookup, not from the authorization.
    expect(outcome).toMatchObject({ ok: true, recovered: true });

    const [persisted] = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(persisted).toMatchObject({
      cbteTipo: 11,
      cbteNro: 43,
      cbteFch: "20260722",
      impTotal: 5000,
      cae: "41124578989845",
      caeVto: "20260801",
      status: "valid",
    });
    expect(persisted.lines).toHaveLength(1);
  });

  // ARCA does not have it, after an authorization that timed out rather than
  // dropped: it is still in flight, so the answer may be just "not yet".
  // Enabling the retry here is what would emit a second comprobante for the
  // same amount. The rest of the contingency table is decided by
  // `emitWithContingency` and `recoverAuthorization` and tested there
  // (`arca/emission.server.test.ts`, `arca/contingency.server.test.ts`); this
  // file keeps the cases where the timeouts and the persisted row must reach
  // the database.
  test("if authorization timed out, ARCA not having it does not enable a retry", async () => {
    const choreography = await seedCollectedChoreography(
      "timeout-sin-comprobante",
    );

    const { outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({
        createVoucher: vi.fn(neverAnswers),
        getVoucherInfo: vi.fn(async () => null),
      }),
      FAST_TIMEOUTS,
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "unverified",
      attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
    });
    expect(
      await listAnchorComprobantes(choreographyAnchor(choreography.id)),
    ).toHaveLength(0);
  });

  describe("re-verification (#577)", () => {
    async function recheckWith(
      choreographyId: string,
      eventId: string,
      billing: ArcaBillingPort,
      cbteNro = 43,
    ) {
      const deps = emissionDeps(billing);
      const outcome = await recheckFacturaC(
        { anchor: choreographyAnchor(choreographyId), eventId, cbteNro },
        deps,
      );
      return { deps, outcome };
    }

    test("the comprobante shows up in ARCA: it is persisted with that CAE and without authorizing again", async () => {
      const choreography =
        await seedCollectedChoreography("recheck-recuperado");

      const { deps, outcome } = await recheckWith(
        choreography.id,
        choreography.eventId,
        fakeBilling({ getVoucherInfo: vi.fn(async () => consultada()) }),
      );

      expect(deps.billing.getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
      // It is the only exit that persists a recovered comprobante: checking by
      // hand in the portal leaves the operator with nothing to do with the fact.
      expect(outcome).toMatchObject({ ok: true, recovered: true });
      expect(deps.billing.createVoucher).not.toHaveBeenCalled();

      const [persisted] = await listAnchorComprobantes(
        choreographyAnchor(choreography.id),
      );
      expect(persisted).toMatchObject({
        cbteNro: 43,
        impTotal: 5000,
        cae: "41124578989845",
        status: "valid",
      });
    });

    // The amount it is validated against comes from the choreography's billable,
    // not from the form: a tampered or stale `cbteNro` cannot force somebody
    // else's CAE to be persisted (ADR-0012 decision 4).
    test("the server recomputes the amount: if the queried one does not match, it stays unverified", async () => {
      const choreography = await seedCollectedChoreography(
        "recheck-otro-importe",
      );

      const { outcome } = await recheckWith(
        choreography.id,
        choreography.eventId,
        fakeBilling({
          getVoucherInfo: vi.fn(async () => consultada({ impTotal: 9999 })),
        }),
      );

      expect(outcome).toMatchObject({ ok: false, reason: "unverified" });
      expect(
        await listAnchorComprobantes(choreographyAnchor(choreography.id)),
      ).toHaveLength(0);
    });
  });
});

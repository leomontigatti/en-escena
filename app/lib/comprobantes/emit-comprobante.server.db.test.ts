import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import type {
  CreateVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations } from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import { removeInscriptionsFromRoster } from "@/lib/choreographies/inscription-withdrawal.server";
import {
  type ArcaBillingPort,
  type ArcaTimeouts,
} from "@/lib/comprobantes/arca/client.server";
import type { ArcaVoucher } from "@/lib/comprobantes/arca/factura-c";
import {
  facturaCAprobada,
  facturaCConsultada,
  notaRechazada10197,
} from "@/lib/comprobantes/arca/wsfe-responses.test-support";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import { emitAnchorComprobante } from "@/lib/comprobantes/emit-comprobante.server";
import {
  abandonComprobanteReservation,
  recheckComprobanteReservation,
} from "@/lib/comprobantes/reserved-attempt.server";
import {
  listAnchorComprobantes,
  recordComprobante,
} from "@/lib/comprobantes/comprobantes.server";

import {
  allocatePayment,
  approvingNumber,
  connectionLost,
  emissionDeps,
  FAST_TIMEOUTS,
  facturaCInput,
  fakeBilling,
  neverAnswers,
} from "@/lib/comprobantes/comprobante-emission.test-support";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../tests/db/harness";

installDatabaseTestHooks();

// Every inscription is priced 10000 with a 3000 `Seña` — the `solo` row and the
// 30% the event requires. The price is repeated with a far-off deadline because
// the threshold comes from the price applicable TODAY, and the catalogue's one
// expires in 2026.
async function seedEventChoreographies(email: string) {
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

  const createChoreography = (name: string) =>
    createChoreographyRecord({
      academyId: academy.id,
      eventId: event.id,
      modalityId: catalog.modality.id,
      categoryId: catalog.categoryWithoutLevel.id,
      scheduleCapacityId: catalog.scheduleCapacity.id,
      name,
    });

  return { academy, createChoreography, event };
}

async function enrol(
  choreographyId: string,
  dancerId: string,
  id: string = crypto.randomUUID(),
) {
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({ choreographyId, dancerId, ageAtEventStart: 14, id })
    .returning();

  return inscription;
}

async function seedChoreographyWithInscriptions(
  email: string,
  inscriptionCount: number,
) {
  const { academy, createChoreography, event } =
    await seedEventChoreographies(email);
  const choreography = await createChoreography("Coreografía a facturar");

  const inscriptions = [];
  for (let index = 0; index < inscriptionCount; index++) {
    const dancer = await createDancer(academy.id);
    inscriptions.push(await enrol(choreography.id, dancer.id));
  }

  return { event, academy, choreography, createChoreography, inscriptions };
}

// A second unit in the same event — only one event is active at a time — with
// its one dancer's deposit covered, owing its 10000 invoice.
async function addSenadaChoreography(
  seeded: Pick<
    Awaited<ReturnType<typeof seedChoreographyWithInscriptions>>,
    "academy" | "createChoreography"
  >,
  name: string,
) {
  const choreography = await seeded.createChoreography(name);
  const inscription = await enrol(
    choreography.id,
    (await createDancer(seeded.academy.id)).id,
  );
  await allocatePayment({
    academyId: seeded.academy.id,
    eventId: choreography.eventId,
    inscriptionId: inscription.id,
    amount: 5000,
  });

  return choreography;
}

async function withdraw(inscriptionId: string) {
  await db
    .update(choreographyDancers)
    .set({ withdrawnAt: new Date("2026-04-01T12:00:00Z") })
    .where(eq(choreographyDancers.id, inscriptionId));
}

// `today` moves the business date the emission runs on; `cbteFch` is the date
// the operator chose, today when absent.
function emit(
  choreography: { id: string; eventId: string },
  billing: ArcaBillingPort = fakeBilling(),
  overrides: { cbteFch?: string; today?: string; timeouts?: ArcaTimeouts } = {},
) {
  const deps = {
    ...emissionDeps(billing, overrides.timeouts),
    ...(overrides.today ? { today: overrides.today } : {}),
  };

  return {
    deps,
    outcome: emitAnchorComprobante(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
        ...(overrides.cbteFch ? { cbteFch: overrides.cbteFch } : {}),
      },
      deps,
    ),
  };
}

function sentVoucher(billing: ArcaBillingPort): ArcaVoucher {
  return vi.mocked(billing.createVoucher).mock.calls[0][0] as ArcaVoucher;
}

/** A choreography of the given size, every dancer's deposit covered and invoiced. */
async function seedInvoicedChoreography(prefix: string, dancers: number) {
  const seeded = await seedChoreographyWithInscriptions(
    `${prefix}.${crypto.randomUUID()}@example.com`,
    dancers,
  );
  for (const inscription of seeded.inscriptions) {
    await allocatePayment({
      academyId: seeded.academy.id,
      eventId: seeded.choreography.eventId,
      inscriptionId: inscription.id,
      amount: 3000,
    });
  }
  const invoiced = await emit(seeded.choreography, approvingNumber(43)).outcome;
  if (!invoiced.ok) {
    throw new Error(`Expected the invoice to emit: ${invoiced.message}`);
  }

  return { ...seeded, factura: invoiced.comprobante };
}

describe("emitAnchorComprobante — the invoice", () => {
  test("bills the full price once the choreography is `Señada`, not what was collected", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `emision.${crypto.randomUUID()}@example.com`,
        2,
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
      inscriptionId: inscriptions[1].id,
      amount: 10000,
    });

    const { deps, outcome } = emit(choreography);

    await expect(outcome).resolves.toMatchObject({
      ok: true,
      recovered: false,
    });
    expect(deps.billing.getLastVoucher).toHaveBeenCalledWith(1, 11);
    const sent = sentVoucher(deps.billing);
    // ultimoAutorizado.cbteNro = 42 → next 43.
    expect(sent).toMatchObject({
      CbteDesde: 43,
      CbteTipo: 11,
      ImpTotal: 20000,
      Concepto: 2,
      FchServDesde: "20260501",
      FchServHasta: "20260503",
      FchVtoPago: "20260722",
    });
    expect(sent.CbtesAsoc).toBeUndefined();

    const [persisted] = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(persisted).toMatchObject({
      cbteTipo: 11,
      cbteNro: 43,
      impTotal: 20000,
      associatedComprobanteId: null,
      cae: "41124578989845",
      status: "valid",
    });
    expect(persisted.lines.map((line) => line.amount)).toEqual([10000, 10000]);
  });

  test("is refused below `Señada`, before ARCA is asked anything", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `sinsena.${crypto.randomUUID()}@example.com`,
        2,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 10000,
    });
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[1].id,
      amount: 2999,
    });

    const { deps, outcome } = emit(choreography);

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      reason: "refused",
      refusals: ["below-deposit"],
    });
    expect(deps.billing.getLastVoucher).not.toHaveBeenCalled();
  });

  test("is refused at a zero total on an empty roster", async () => {
    const { choreography } = await seedChoreographyWithInscriptions(
      `vacia.${crypto.randomUUID()}@example.com`,
      0,
    );

    const { deps, outcome } = emit(choreography);

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      reason: "refused",
      refusals: ["nothing-to-bill"],
    });
    expect(deps.billing.getLastVoucher).not.toHaveBeenCalled();
  });

  test("is refused at a zero total on a real roster that owes nothing", async () => {
    // Waived (`Bonificada`) is how a real roster's total reaches zero here: the
    // dancer discount tops out at 15%.
    const { choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `bonificada.${crypto.randomUUID()}@example.com`,
        2,
      );
    await db
      .update(choreographyDancers)
      .set({ waivedAt: new Date("2026-04-01T12:00:00Z") })
      .where(eq(choreographyDancers.choreographyId, choreography.id));
    expect(inscriptions).toHaveLength(2);

    const { deps, outcome } = emit(choreography);

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      reason: "refused",
      refusals: ["nothing-to-bill"],
    });
    expect(deps.billing.getLastVoucher).not.toHaveBeenCalled();
  });

  test("an ARCA rejection persists no comprobante", async () => {
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

    const { outcome } = emit(
      choreography,
      fakeBilling({
        createVoucher: vi.fn(async () => notaRechazada10197),
      }),
    );

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      reason: "rejected",
    });
    await expect(
      listAnchorComprobantes(choreographyAnchor(choreography.id)),
    ).resolves.toHaveLength(0);
    // A rejected `FECAESolicitar` consumes no number (#686): the reservation is
    // gone and the series is free for the retry.
    await expect(
      emit(choreography, approvingNumber(43)).outcome,
    ).resolves.toMatchObject({ ok: true, comprobante: { cbteNro: 43 } });
  });

  test("rejects a choreography that belongs to another event", async () => {
    const { choreography } = await seedChoreographyWithInscriptions(
      `evento.${crypto.randomUUID()}@example.com`,
      1,
    );

    const { deps, outcome } = emit({
      id: choreography.id,
      eventId: "otro-evento",
    });

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      reason: "not-found",
    });
    expect(deps.billing.getLastVoucher).not.toHaveBeenCalled();
  });
});

describe("emitAnchorComprobante — the delta after the invoice", () => {
  test("an addition emits one debit note anchored at the invoice, and leaves the delta at zero", async () => {
    const { academy, choreography, factura } = await seedInvoicedChoreography(
      "alta",
      1,
    );
    // The new dancer pays nothing: the choreography falls below `Señada`, and
    // the debit note has no gate.
    const added = await enrol(
      choreography.id,
      (await createDancer(academy.id)).id,
    );

    const billing = approvingNumber(5, "41124578989850");
    const { outcome } = emit(choreography, billing, { today: "2026-07-25" });

    await expect(outcome).resolves.toMatchObject({ ok: true });
    expect(billing.getLastVoucher).toHaveBeenCalledWith(1, 12);
    expect(sentVoucher(billing)).toMatchObject({
      CbteTipo: 12,
      ImpTotal: 10000,
      CbtesAsoc: [
        {
          Tipo: 11,
          PtoVta: 1,
          Nro: 43,
          Cuit: "30717611590",
          CbteFch: "20260722",
        },
      ],
      // The invoice's period, and the note's own date as its due date.
      FchServDesde: "20260501",
      FchServHasta: "20260503",
      FchVtoPago: "20260725",
    });

    const scope = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(scope).toHaveLength(2);
    expect(scope[0]).toMatchObject({ id: factura.id, status: "adjusted" });
    expect(scope[1]).toMatchObject({
      cbteTipo: 12,
      impTotal: 10000,
      associatedComprobanteId: factura.id,
    });
    expect(scope[1].lines).toEqual([
      expect.objectContaining({
        choreographyInscriptionId: added.id,
        amount: 10000,
      }),
    ]);

    await expect(emit(choreography).outcome).resolves.toMatchObject({
      ok: false,
      reason: "refused",
      refusals: ["nothing-owed"],
    });
  });

  test("a withdrawal emits one partial credit note for the line less the retained deposit", async () => {
    const { choreography, factura, inscriptions } =
      await seedInvoicedChoreography("baja", 2);
    await withdraw(inscriptions[1].id);

    const billing = approvingNumber(8, "41124599990011");
    const { outcome } = emit(choreography, billing);

    await expect(outcome).resolves.toMatchObject({ ok: true });
    expect(billing.getLastVoucher).toHaveBeenCalledWith(1, 13);
    expect(sentVoucher(billing)).toMatchObject({
      CbteTipo: 13,
      ImpTotal: 7000,
      CbtesAsoc: [{ Tipo: 11, Nro: 43 }],
    });

    const scope = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(scope[0]).toMatchObject({ id: factura.id, status: "adjusted" });
    expect(scope[1]).toMatchObject({
      cbteTipo: 13,
      impTotal: 7000,
      associatedComprobanteId: factura.id,
    });
    expect(scope[1].lines).toEqual([
      expect.objectContaining({
        choreographyInscriptionId: inscriptions[1].id,
        amount: 7000,
      }),
    ]);

    await expect(emit(choreography).outcome).resolves.toMatchObject({
      ok: false,
      reason: "refused",
      refusals: ["nothing-owed"],
    });
  });

  // #1065, #674: a withdrawal retains exactly the deposit, whatever the row
  // still holds above it; the excess is the academy's to release.
  test("a fully paid withdrawal is credited its line less the deposit, not less what it holds", async () => {
    const { academy, choreography, inscriptions } =
      await seedInvoicedChoreography("baja-pagada", 2);
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[1].id,
      amount: 7000,
    });
    await withdraw(inscriptions[1].id);

    await expect(
      emit(choreography, approvingNumber(8, "41124599990011")).outcome,
    ).resolves.toMatchObject({
      ok: true,
      comprobante: { cbteTipo: 13, impTotal: 7000 },
    });
  });

  test("a withdrawal holding less than its deposit retains what it holds", async () => {
    const { choreography, inscriptions } = await seedInvoicedChoreography(
      "baja-parcial",
      2,
    );
    await db
      .update(paymentAllocations)
      .set({ amount: 1000 })
      .where(
        eq(paymentAllocations.choreographyInscriptionId, inscriptions[1].id),
      );
    await withdraw(inscriptions[1].id);

    await expect(
      emit(choreography, approvingNumber(8, "41124599990011")).outcome,
    ).resolves.toMatchObject({
      ok: true,
      comprobante: { cbteTipo: 13, impTotal: 9000 },
    });
  });

  test("a withdrawal that retains nothing credits the whole line, and annuls a single-dancer invoice", async () => {
    const { choreography, factura, inscriptions } =
      await seedInvoicedChoreography("medico", 1);
    await withdraw(inscriptions[0].id);
    // The medical case: the deposit goes back to `Saldo disponible`.
    await db
      .delete(paymentAllocations)
      .where(
        eq(paymentAllocations.choreographyInscriptionId, inscriptions[0].id),
      );

    const { outcome } = emit(
      choreography,
      approvingNumber(8, "41124599990011"),
    );

    await expect(outcome).resolves.toMatchObject({
      ok: true,
      comprobante: { cbteTipo: 13, impTotal: 10000 },
    });
    const [reloaded] = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(reloaded).toMatchObject({ id: factura.id, status: "annulled" });
  });

  test("a withdrawal that makes a remaining inscription dearer emits a debit note", async () => {
    // One dancer in three choreographies earns the 10% `Descuento por
    // bailarín` on all but one of them. Ids fix which one keeps full price:
    // the discount spares the first by price, then by id.
    const { academy, createChoreography } = await seedEventChoreographies(
      `descuento.${crypto.randomUUID()}@example.com`,
    );
    const dancer = await createDancer(academy.id);
    const [kept, invoiced, dropped] = await Promise.all([
      createChoreography("Sin descuento"),
      createChoreography("Facturada con descuento"),
      createChoreography("De la que se retira"),
    ]);
    await enrol(kept.id, dancer.id, `a-${crypto.randomUUID()}`);
    const discounted = await enrol(
      invoiced.id,
      dancer.id,
      `b-${crypto.randomUUID()}`,
    );
    const leaving = await enrol(
      dropped.id,
      dancer.id,
      `c-${crypto.randomUUID()}`,
    );
    await allocatePayment({
      academyId: academy.id,
      eventId: invoiced.eventId,
      inscriptionId: discounted.id,
      amount: 3000,
    });
    await expect(
      emit(invoiced, approvingNumber(43)).outcome,
    ).resolves.toMatchObject({ ok: true, comprobante: { impTotal: 9000 } });

    // Leaving the third choreography drops the dancer to two inscriptions and
    // out of the discount: the invoiced one now owes its full price.
    await withdraw(leaving.id);

    const billing = approvingNumber(5, "41124578989850");
    await expect(emit(invoiced, billing).outcome).resolves.toMatchObject({
      ok: true,
      comprobante: { cbteTipo: 12, impTotal: 1000 },
    });
  });
});

describe("emitAnchorComprobante — what the operator confirmed", () => {
  // The dialog previewed a credit note; a dancer added in another tab turned
  // the delta positive before the click. Emitting the debit note nobody saw
  // would be irreversible.
  test("refuses a plan that is no longer the document the operator confirmed, before ARCA", async () => {
    const { academy, choreography } = await seedInvoicedChoreography(
      "confirmada",
      1,
    );
    await enrol(choreography.id, (await createDancer(academy.id)).id);

    const billing = fakeBilling();
    const outcome = await emitAnchorComprobante(
      {
        anchor: choreographyAnchor(choreography.id),
        eventId: choreography.eventId,
        confirmed: { kind: "nota_credito_c", amount: 5000 },
      },
      emissionDeps(billing),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "changed" });
    expect(billing.getLastVoucher).not.toHaveBeenCalled();
  });

  test("emits the confirmed plan when it still holds", async () => {
    const { academy, choreography } = await seedInvoicedChoreography(
      "confirmada-vigente",
      1,
    );
    await enrol(choreography.id, (await createDancer(academy.id)).id);

    await expect(
      emitAnchorComprobante(
        {
          anchor: choreographyAnchor(choreography.id),
          eventId: choreography.eventId,
          confirmed: { kind: "nota_debito_c", amount: 10000 },
        },
        emissionDeps(approvingNumber(5, "41124578989850")),
      ),
    ).resolves.toMatchObject({ ok: true, comprobante: { cbteTipo: 12 } });
  });
});

describe("emitAnchorComprobante — the crediting ceiling", () => {
  // ARCA authorized a credit note larger than its invoice (#686), so the fake
  // is NOT taught to refuse one: if this check fails, nothing else would.
  test("refuses a credit note that would take ΣNC past FC + ΣND, before ARCA is called", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `techo.${crypto.randomUUID()}@example.com`,
        1,
      );
    const [inscription] = inscriptions;
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 3000,
    });
    // Two invoices, the shape the collection-driven model left: the star sits
    // on the first, a 1000 one, while the unit documents 11000 in all.
    await recordComprobante(
      facturaCInput({
        choreographyId: choreography.id,
        eventId: choreography.eventId,
        cbteNro: 40,
        impTotal: 1000,
        lines: [{ choreographyInscriptionId: inscription.id, amount: 1000 }],
      }),
    );
    await recordComprobante(
      facturaCInput({
        choreographyId: choreography.id,
        eventId: choreography.eventId,
        cbteNro: 41,
        impTotal: 10000,
        lines: [{ choreographyInscriptionId: inscription.id, amount: 10000 }],
      }),
    );
    // Withdrawn retaining its 3000: an 8000 credit, past the first invoice.
    await withdraw(inscription.id);

    const { deps, outcome } = emit(choreography);

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      reason: "refused",
      refusals: ["over-credit"],
    });
    expect(deps.billing.getLastVoucher).not.toHaveBeenCalled();
    expect(deps.billing.createVoucher).not.toHaveBeenCalled();
    await expect(
      listAnchorComprobantes(choreographyAnchor(choreography.id)),
    ).resolves.toHaveLength(2);
  });

  // #686: the refusal comes in `Observaciones`, with no `Errors` node.
  test("a note ARCA refuses with 10197 is a rejection, and nothing is persisted", async () => {
    const { choreography, inscriptions } = await seedInvoicedChoreography(
      "10197",
      2,
    );
    await withdraw(inscriptions[1].id);

    const { outcome } = emit(
      choreography,
      fakeBilling({ createVoucher: vi.fn(async () => notaRechazada10197) }),
    );

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      reason: "rejected",
      message: expect.stringContaining("CbteAsoc"),
      arca: {
        resultado: "R",
        errors: [],
        observaciones: [{ code: 10197 }],
      },
    });
    await expect(
      listAnchorComprobantes(choreographyAnchor(choreography.id)),
    ).resolves.toHaveLength(1);
  });
});

/**
 * The unit is serialised by a session advisory lock keyed on the anchor, taken
 * fail-fast, so two operators pressing `Emitir` at once do not each read the
 * same delta and each authorize a comprobante for it: the second is turned away
 * as `busy` before it reads anything, and ARCA is asked once.
 *
 * ARCA answers slowly on purpose: without the lock the second plan would land
 * inside that window. That window only exists where the two emissions really
 * do overlap — under PGlite the single session re-enters its own advisory lock,
 * so the assertion could not fail there. The test is therefore gated to the
 * Postgres backend instead of passing for free on the fast suite.
 */
describe.skipIf(isPgliteTestBackend())(
  "comprobante emission under real contention",
  () => {
    test("two concurrent emissions of one unit make a single comprobante, the second turned away", async () => {
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

      const billing = fakeBilling({
        createVoucher: vi.fn(async (): Promise<CreateVoucherResultDto> => {
          await new Promise((resolve) => setTimeout(resolve, 50));

          return facturaCAprobada;
        }),
      });

      const outcomes = await Promise.all([
        emit(choreography, billing).outcome,
        emit(choreography, billing).outcome,
      ]);

      expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
      expect(outcomes.filter((outcome) => !outcome.ok)).toMatchObject([
        { ok: false, reason: "busy" },
      ]);
      expect(billing.createVoucher).toHaveBeenCalledTimes(1);
      await expect(
        listAnchorComprobantes(choreographyAnchor(choreography.id)),
      ).resolves.toMatchObject([{ cbteNro: 43, impTotal: 10000 }]);
    });
  },
);

// ARCA does not respond (ADR-0012): the failure is classified by phase and, if
// it was cut off while authorizing, the server resolves the ambiguity by
// querying the exact comprobante it tried to emit, in that document's series.
describe("emitAnchorComprobante (ARCA does not respond)", () => {
  // A `Señada` choreography of one dancer, owing its 10000 invoice: the number
  // to attempt is 43 (`ultimoAutorizado` = 42).
  async function seedSenadaChoreography(prefix: string) {
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

  // `FECompConsultar` for comprobante 43 as ARCA recorded it.
  function consultada(
    overrides: Partial<VoucherInfoResultDto> = {},
  ): VoucherInfoResultDto {
    return {
      ...facturaCConsultada,
      cbteDesde: 43,
      cbteHasta: 43,
      impTotal: 10000,
      cbteFch: "20260722",
      ...overrides,
    };
  }

  test("with authorization cut off, it queries the exact comprobante and persists it with the CAE ARCA returns", async () => {
    const choreography = await seedSenadaChoreography("recuperado");

    const { deps, outcome } = emit(
      choreography,
      fakeBilling({
        createVoucher: vi.fn(connectionLost),
        getVoucherInfo: vi.fn(async () => consultada()),
      }),
    );

    await expect(outcome).resolves.toMatchObject({
      ok: true,
      recovered: true,
    });
    // The sales point, type and sequence number that were attempted get queried.
    expect(deps.billing.getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
    const [persisted] = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(persisted).toMatchObject({
      cbteTipo: 11,
      cbteNro: 43,
      impTotal: 10000,
      cae: "41124578989845",
      status: "valid",
    });
    expect(persisted.lines).toHaveLength(1);
  });

  test("a note cut off while authorizing is looked up in its own series", async () => {
    const { choreography, factura, inscriptions } =
      await seedInvoicedChoreography("recuperada-nc", 2);
    await withdraw(inscriptions[1].id);

    const { deps, outcome } = emit(
      choreography,
      fakeBilling({
        createVoucher: vi.fn(connectionLost),
        getVoucherInfo: vi.fn(async () => consultada({ impTotal: 7000 })),
      }),
    );

    await expect(outcome).resolves.toMatchObject({
      ok: true,
      recovered: true,
      comprobante: {
        cbteTipo: 13,
        impTotal: 7000,
        associatedComprobanteId: factura.id,
      },
    });
    expect(deps.billing.getVoucherInfo).toHaveBeenCalledWith(43, 1, 13);
  });

  // ARCA does not have it, after an authorization that timed out rather than
  // dropped: it is still in flight, so the answer may be just "not yet".
  // Enabling the retry here is what would emit a second comprobante for the
  // same amount. The rest of the contingency table is decided by
  // `emitWithContingency` and `recoverAuthorization` and tested there
  // (`arca/emission.server.test.ts`, `arca/contingency.server.test.ts`).
  test("if authorization timed out, ARCA not having it does not enable a retry", async () => {
    const choreography = await seedSenadaChoreography(
      "timeout-sin-comprobante",
    );

    const { outcome } = emit(
      choreography,
      fakeBilling({
        createVoucher: vi.fn(neverAnswers),
        getVoucherInfo: vi.fn(async () => null),
      }),
      { timeouts: FAST_TIMEOUTS },
    );

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      reason: "unverified",
      attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
    });
    await expect(
      listAnchorComprobantes(choreographyAnchor(choreography.id)),
    ).resolves.toHaveLength(0);
  });
});

/**
 * The correlative reservation (ADR-0014 §7, #578): the next number of a series
 * is committed before `FECAESolicitar`, a live one blocks its series, and it
 * goes once ARCA settles it — recorded, released, or abandoned.
 */
describe("the correlative reservation", () => {
  async function seedSenadaChoreography(prefix: string) {
    const seeded = await seedChoreographyWithInscriptions(
      `${prefix}.${crypto.randomUUID()}@example.com`,
      1,
    );
    await allocatePayment({
      academyId: seeded.academy.id,
      eventId: seeded.choreography.eventId,
      inscriptionId: seeded.inscriptions[0].id,
      amount: 5000,
    });
    return seeded;
  }

  // An invoice whose authorization timed out and that ARCA does not have yet:
  // `Factura C` 43 stays reserved, unverified.
  async function leaveUnverified(choreography: {
    id: string;
    eventId: string;
  }) {
    const outcome = await emit(
      choreography,
      fakeBilling({
        createVoucher: vi.fn(neverAnswers),
        getVoucherInfo: vi.fn(async () => null),
      }),
      { timeouts: FAST_TIMEOUTS },
    ).outcome;

    expect(outcome).toMatchObject({
      ok: false,
      reason: "unverified",
      attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
    });
  }

  // `FECompConsultar` for invoice 43 as ARCA recorded it.
  function consultada(
    overrides: Partial<VoucherInfoResultDto> = {},
  ): VoucherInfoResultDto {
    return {
      ...facturaCConsultada,
      cbteDesde: 43,
      cbteHasta: 43,
      impTotal: 10000,
      cbteFch: "20260722",
      ...overrides,
    };
  }

  const invoice43 = { cbteTipo: 11, cbteNro: 43 };

  test("a live reservation blocks its series: another unit's invoice is refused before ARCA is asked anything, naming the attempt", async () => {
    const seeded = await seedSenadaChoreography("bloqueo");
    await leaveUnverified(seeded.choreography);
    const other = await addSenadaChoreography(seeded, "Otra coreografía");

    const { deps, outcome } = emit(other);

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      reason: "unverified",
      message: expect.stringMatching(
        /^Factura C 0001-00000043 de la coreografía «Coreografía a facturar», por \$\s?10\.000, quedó sin confirmar con ARCA\. No se puede emitir otro comprobante de la serie Factura C, punto de venta 0001 hasta resolverlo\.$/,
      ),
      attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
    });
    expect(deps.billing.getLastVoucher).not.toHaveBeenCalled();
    expect(deps.billing.createVoucher).not.toHaveBeenCalled();
  });

  // Its document may already be at ARCA, and the plan cannot see it: a note
  // in another series planned now would be computed against a stale delta.
  test("a live reservation of a unit blocks that unit in every series", async () => {
    const { academy, choreography, inscriptions } =
      await seedInvoicedChoreography("ancla-bloqueada", 2);
    await withdraw(inscriptions[1].id);
    const creditNote = await emit(
      choreography,
      fakeBilling({
        createVoucher: vi.fn(neverAnswers),
        getVoucherInfo: vi.fn(async () => null),
      }),
      { timeouts: FAST_TIMEOUTS },
    ).outcome;
    expect(creditNote).toMatchObject({
      ok: false,
      reason: "unverified",
      attempt: { cbteTipo: 13 },
    });
    // Two more dancers make the unit owe a debit note, in series 12.
    await enrol(choreography.id, (await createDancer(academy.id)).id);
    await enrol(choreography.id, (await createDancer(academy.id)).id);

    const { deps, outcome } = emit(choreography, approvingNumber(5));

    await expect(outcome).resolves.toMatchObject({
      ok: false,
      reason: "unverified",
      attempt: { cbteTipo: 13, cbteNro: 43 },
    });
    expect(deps.billing.createVoucher).not.toHaveBeenCalled();
  });

  test("a date below the series' floor is refused before ARCA, naming the series", async () => {
    // Invoice 43 went out on 2026-07-22, which is now the series' floor.
    const seeded = await seedInvoicedChoreography("piso", 1);
    const choreography = await addSenadaChoreography(
      seeded,
      "Otra coreografía",
    );

    const { deps, outcome } = emit(choreography, approvingNumber(44), {
      today: "2026-07-25",
      cbteFch: "2026-07-21",
    });

    await expect(outcome).resolves.toEqual({
      ok: false,
      reason: "invalid-date",
      message:
        "La fecha no puede ser anterior al 22/07/2026, la del último comprobante autorizado en la serie Factura C, punto de venta 0001: ARCA no acepta fechas anteriores en esa serie.",
    });
    expect(deps.billing.getLastVoucher).not.toHaveBeenCalled();
  });

  test("a back-dated date within the floor goes out as chosen", async () => {
    const seeded = await seedInvoicedChoreography("retrofechado", 1);
    const choreography = await addSenadaChoreography(
      seeded,
      "Otra coreografía",
    );
    const billing = approvingNumber(44);

    const { outcome } = emit(choreography, billing, {
      today: "2026-07-25",
      cbteFch: "2026-07-23",
    });

    await expect(outcome).resolves.toMatchObject({ ok: true });
    expect(sentVoucher(billing)).toMatchObject({
      CbteFch: "20260723",
      FchVtoPago: "20260723",
    });
  });

  describe("re-verification (#577)", () => {
    test("the attempt shows up in ARCA: what was submitted is recorded, without authorizing again, and the series is free", async () => {
      const seeded = await seedSenadaChoreography("recheck-recuperado");
      const { academy, choreography } = seeded;
      await leaveUnverified(choreography);
      // The roster moves after the attempt: what ARCA authorized is recorded
      // all the same, and the delta it leaves is the next note's (#578).
      await enrol(choreography.id, (await createDancer(academy.id)).id);
      const billing = fakeBilling({
        getVoucherInfo: vi.fn(async () => consultada()),
      });

      const outcome = await recheckComprobanteReservation(
        invoice43,
        emissionDeps(billing),
      );

      expect(billing.getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
      expect(billing.createVoucher).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ ok: true, recovered: true });
      const [persisted] = await listAnchorComprobantes(
        choreographyAnchor(choreography.id),
      );
      expect(persisted).toMatchObject({ cbteNro: 43, impTotal: 10000 });
      expect(persisted.lines).toHaveLength(1);

      const other = await addSenadaChoreography(seeded, "Otra coreografía");
      await expect(
        emit(other, approvingNumber(44)).outcome,
      ).resolves.toMatchObject({ ok: true });
    });

    test("ARCA holds another comprobante at the number: number-taken, the series stays blocked until the attempt is abandoned", async () => {
      const seeded = await seedSenadaChoreography("numero-tomado");
      const { choreography } = seeded;
      await leaveUnverified(choreography);
      const billing = fakeBilling({
        getVoucherInfo: vi.fn(async () => consultada({ impTotal: 9999 })),
      });

      await expect(
        recheckComprobanteReservation(invoice43, emissionDeps(billing)),
      ).resolves.toMatchObject({
        ok: false,
        reason: "number-taken",
        attempt: { cbteTipo: 11, cbteNro: 43 },
      });
      await expect(
        listAnchorComprobantes(choreographyAnchor(choreography.id)),
      ).resolves.toHaveLength(0);

      const other = await addSenadaChoreography(seeded, "Otra coreografía");
      await expect(emit(other).outcome).resolves.toMatchObject({
        ok: false,
        reason: "number-taken",
        message: expect.stringContaining("Verificá en el portal de ARCA"),
      });

      await expect(
        abandonComprobanteReservation(invoice43, emissionDeps(fakeBilling())),
      ).resolves.toEqual({ ok: true, released: true });
      await expect(
        emit(other, approvingNumber(44)).outcome,
      ).resolves.toMatchObject({ ok: true, comprobante: { cbteNro: 44 } });
    });

    test("the operator's verification releases an attempt ARCA has not reached, and the unit can emit again", async () => {
      const { choreography } = await seedSenadaChoreography("verificado");
      await leaveUnverified(choreography);

      await expect(
        abandonComprobanteReservation(invoice43, emissionDeps(fakeBilling())),
      ).resolves.toEqual({ ok: true, released: true });
      await expect(
        emit(choreography, approvingNumber(43)).outcome,
      ).resolves.toMatchObject({ ok: true, comprobante: { cbteNro: 43 } });
    });

    // Recording the attempt needs every inscription it names: one taken off
    // the roster while the attempt is live is withdrawn, not deleted.
    test("an inscription a live attempt names survives its removal, so the attempt can still be recorded", async () => {
      const { academy, choreography } = await seedInvoicedChoreography(
        "reserva-baja",
        1,
      );
      const added = await enrol(
        choreography.id,
        (await createDancer(academy.id)).id,
      );
      const debitNote = await emit(
        choreography,
        fakeBilling({
          createVoucher: vi.fn(neverAnswers),
          getVoucherInfo: vi.fn(async () => null),
        }),
        { timeouts: FAST_TIMEOUTS },
      ).outcome;
      expect(debitNote).toMatchObject({
        reason: "unverified",
        attempt: { cbteTipo: 12, cbteNro: 43 },
      });

      await removeInscriptionsFromRoster(db, [added.id]);

      await expect(
        recheckComprobanteReservation(
          { cbteTipo: 12, cbteNro: 43 },
          emissionDeps(
            fakeBilling({ getVoucherInfo: vi.fn(async () => consultada()) }),
          ),
        ),
      ).resolves.toMatchObject({
        ok: true,
        comprobante: { cbteTipo: 12, impTotal: 10000 },
      });
    });

    test("an attempt already resolved answers what became of it", async () => {
      const { choreography } = await seedSenadaChoreography("ya-resuelto");
      await emit(choreography, approvingNumber(43)).outcome;

      await expect(
        recheckComprobanteReservation(invoice43, emissionDeps(fakeBilling())),
      ).resolves.toMatchObject({
        ok: true,
        recovered: true,
        comprobante: { cbteNro: 43 },
      });
      await expect(
        recheckComprobanteReservation(
          { cbteTipo: 11, cbteNro: 44 },
          emissionDeps(fakeBilling()),
        ),
      ).resolves.toMatchObject({ ok: false, reason: "not-emitted" });
    });
  });
});

/**
 * Two units emitting at once in one series both read the same last number.
 * The reservation's unique index is what stops them from submitting it twice:
 * the loser's insert conflicts and it stops before ARCA. Postgres only, for the
 * reason the contention test above gives.
 */
describe.skipIf(isPgliteTestBackend())(
  "the correlative reservation under real contention",
  () => {
    test("two concurrent emissions in one series cannot take the same number", async () => {
      const seeded = await seedChoreographyWithInscriptions(
        `serie.${crypto.randomUUID()}@example.com`,
        0,
      );
      const first = await addSenadaChoreography(seeded, "Primera");
      const second = await addSenadaChoreography(seeded, "Segunda");
      const billing = fakeBilling({
        createVoucher: vi.fn(async (): Promise<CreateVoucherResultDto> => {
          await new Promise((resolve) => setTimeout(resolve, 50));

          return facturaCAprobada;
        }),
      });

      const outcomes = await Promise.all([
        emit(first, billing).outcome,
        emit(second, billing).outcome,
      ]);

      expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
      expect(outcomes.filter((outcome) => !outcome.ok)).toMatchObject([
        { ok: false, reason: "unverified", attempt: { cbteNro: 43 } },
      ]);
      expect(billing.createVoucher).toHaveBeenCalledTimes(1);
    });
  },
);

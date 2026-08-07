import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
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
import {
  ArcaClient,
  type ArcaBillingPort,
  type ArcaTimeouts,
} from "@/lib/comprobantes/arca/client.server";
import type { ArcaVoucher } from "@/lib/comprobantes/arca/factura-c";
import {
  facturaCAprobada,
  facturaCConsultada,
  facturaCRechazada,
  ultimoAutorizado,
} from "@/lib/comprobantes/arca/fixtures";
import {
  emitChoreographyFacturaC,
  readFacturaCEmissionConfig,
  recheckChoreographyFacturaC,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import {
  listChoreographyComprobantes,
  recordComprobante,
} from "@/lib/comprobantes/comprobantes.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

function fakeBilling(
  overrides: Partial<ArcaBillingPort> = {},
): ArcaBillingPort {
  return {
    getLastVoucher: vi.fn(
      async (): Promise<LastVoucherResultDto> => ultimoAutorizado,
    ),
    createVoucher: vi.fn(
      async (): Promise<CreateVoucherResultDto> => facturaCAprobada,
    ),
    // Sólo se consulta cuando la autorización se cae: por defecto ARCA no tiene
    // ese comprobante.
    getVoucherInfo: vi.fn(
      async (): Promise<VoucherInfoResultDto | null> => null,
    ),
    ...overrides,
  };
}

// Deps de emisión con cliente ARCA mockeado (cero red) y `cbteFch` fija para no
// depender del reloj.
function emissionDeps(
  billing: ArcaBillingPort,
  timeouts?: ArcaTimeouts,
): FacturaCEmissionDeps & { billing: ArcaBillingPort } {
  return {
    billing,
    client: new ArcaClient(billing, timeouts),
    ptoVta: 1,
    issuerCuit: "30717611590",
    receptorIvaConditionId: 5,
    cbteFch: "20260722",
  };
}

// Timeouts en milisegundos para ejercitar el corte real sin fake timers.
const FAST_TIMEOUTS: ArcaTimeouts = { lookup: 20, authorization: 20 };

function neverAnswers(): Promise<never> {
  return new Promise<never>(() => {});
}

// ARCA cortó la comunicación: el SDK no declara clases ni códigos de error, así
// que una falla de transporte llega como un `Error` cualquiera.
function connectionLost(): Promise<never> {
  return Promise.reject(new Error("socket hang up"));
}

async function seedChoreographyWithInscriptions(
  email: string,
  inscriptionCount: number,
  // Umbral de seña de cada inscripción: la porción del remanente se deriva de
  // lo cobrado contra él, no de un tipo guardado en la asignación.
  depositAmount?: number,
) {
  const event = await createEventRecord({ active: true });
  const academy = await createAcademyRecord({
    academyName: "Academia Emisión",
    email,
  });
  const catalog = await createEventCatalog(event.id);
  const choreography = await createChoreographyRecord({
    academyId: academy.id,
    eventId: event.id,
    modalityId: catalog.modality.id,
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
        depositAmount,
      })
      .returning();
    inscriptions.push(inscription);
  }

  return { event, academy, choreography, inscriptions };
}

let paymentNumber = 0;

// Registra un cobro efectivo: un `Pago` y su `Asignación de pago` sobre la
// inscripción. Es la fuente de verdad financiera de la que deriva la factura.
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
    amount: input.amount,
  });
}

describe("emitChoreographyFacturaC", () => {
  test("deriva CbteNro de FECompUltimoAutorizado + 1 y factura lo cobrado", async () => {
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
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
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
    const [persisted] = await listChoreographyComprobantes(choreography.id);
    expect(persisted).toMatchObject({
      cbteTipo: 11,
      cbteNro: 43,
      impTotal: 10000,
      issuerIvaCondition: "exento",
      receptorDocTipo: 99,
      receptorDocNro: "0",
      receptorIvaConditionId: 5,
      cae: "41124578989845",
      status: "vigente",
    });
    expect(
      [...persisted.lines].map((line) => line.amount).sort((a, b) => a - b),
    ).toEqual([4000, 6000]);
  });

  test("no re-factura porciones ya cubiertas por una factura tipo 11 vigente", async () => {
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
    // Ya hay una Factura C vigente que cubrió 6000 de la inscripción.
    await recordComprobante({
      choreographyId: choreography.id,
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
      lines: [{ inscriptionId: inscription.id, amount: 6000 }],
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
      deps,
    );

    expect(outcome.ok).toBe(true);
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    // Sólo el remanente no facturado: 10000 − 6000.
    expect(sent.ImpTotal).toBe(4000);

    const comprobantes = await listChoreographyComprobantes(choreography.id);
    const nuevo = comprobantes.find((row) => row.cbteNro === 43);
    expect(nuevo?.impTotal).toBe(4000);
    expect(nuevo?.lines[0]?.amount).toBe(4000);
  });

  test("no hay nada que facturar cuando lo cobrado ya está cubierto", async () => {
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
      choreographyId: choreography.id,
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
      lines: [{ inscriptionId: inscription.id, amount: 8000 }],
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
      deps,
    );

    expect(outcome).toMatchObject({ ok: false, reason: "nothing-to-bill" });
    expect(deps.billing.createVoucher).not.toHaveBeenCalled();
  });

  test("no hay nada que facturar sin cobros", async () => {
    const { choreography } = await seedChoreographyWithInscriptions(
      `sincobro.${crypto.randomUUID()}@example.com`,
      1,
    );

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
      deps,
    );

    expect(outcome).toMatchObject({ ok: false, reason: "nothing-to-bill" });
    expect(deps.billing.createVoucher).not.toHaveBeenCalled();
  });

  test("un rechazo de ARCA no persiste comprobante ni altera el estado financiero", async () => {
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
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
      deps,
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("rejected");
      expect(outcome.arca?.errors[0]?.code).toBe(10016);
    }

    // No se persistió ningún comprobante.
    expect(await listChoreographyComprobantes(choreography.id)).toHaveLength(0);
    // El estado financiero (asignaciones de pago) queda intacto.
    const allocations = await db
      .select()
      .from(paymentAllocations)
      .where(eq(paymentAllocations.inscriptionId, inscriptions[0].id));
    expect(allocations).toHaveLength(1);
    expect(allocations[0].amount).toBe(5000);
  });

  test("una factura anulada no cuenta como facturada: su monto vuelve a ser facturable", async () => {
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
      choreographyId: choreography.id,
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
      lines: [{ inscriptionId: inscription.id, amount: 7000 }],
    });
    // Nota de crédito espejo que anula la factura anterior.
    await recordComprobante({
      choreographyId: choreography.id,
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
      lines: [{ inscriptionId: inscription.id, amount: 7000 }],
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
      deps,
    );

    expect(outcome.ok).toBe(true);
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    expect(sent.ImpTotal).toBe(7000);
  });

  test("deriva porción `seña` y congela las fechas de servicio del evento", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `sena.${crypto.randomUUID()}@example.com`,
        1,
        3000,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 3000,
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
      deps,
    );

    expect(outcome.ok).toBe(true);
    // El builder recibe Concepto 2 con el período del evento y el vencimiento en
    // la fecha del comprobante.
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    expect(sent.Concepto).toBe(2);
    expect(sent.FchServDesde).toBe("20260501");
    expect(sent.FchServHasta).toBe("20260503");
    expect(sent.FchVtoPago).toBe("20260722");

    const [persisted] = await listChoreographyComprobantes(choreography.id);
    expect(persisted).toMatchObject({
      porcion: "seña",
      fchServDesde: "20260501",
      fchServHasta: "20260503",
      fchVtoPago: "20260722",
    });
  });

  test("una coreografía cobrada completa y nunca facturada emite un solo comprobante con porción `total`", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `total.${crypto.randomUUID()}@example.com`,
        1,
        3000,
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
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
      deps,
    );

    expect(outcome.ok).toBe(true);
    const comprobantes = await listChoreographyComprobantes(choreography.id);
    expect(comprobantes).toHaveLength(1);
    expect(comprobantes[0]).toMatchObject({
      porcion: "total",
      impTotal: 10000,
    });
  });

  test("cuando la seña ya está facturada, el remanente de saldo deriva porción `saldo`", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `saldo.${crypto.randomUUID()}@example.com`,
        1,
        3000,
      );
    const inscription = inscriptions[0];
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 3000,
    });
    // La seña ya fue facturada por una Factura C vigente que cubrió el depósito.
    await recordComprobante({
      choreographyId: choreography.id,
      eventId: choreography.eventId,
      cbteTipo: 11,
      ptoVta: 1,
      cbteNro: 40,
      cbteFch: "20260701",
      porcion: "seña",
      impTotal: 3000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      receptorDocTipo: 99,
      receptorDocNro: "0",
      receptorIvaConditionId: 5,
      cae: "40000000000000",
      caeVto: "20260710",
      lines: [{ inscriptionId: inscription.id, amount: 3000 }],
    });
    // Entra el cobro del saldo.
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscription.id,
      amount: 7000,
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
      deps,
    );

    expect(outcome.ok).toBe(true);
    const nuevo = (await listChoreographyComprobantes(choreography.id)).find(
      (row) => row.cbteNro === 43,
    );
    expect(nuevo).toMatchObject({ porcion: "saldo", impTotal: 7000 });
  });

  test("reimputar un pago después de emitir no altera la porción ni las fechas congeladas", async () => {
    const { academy, choreography, inscriptions } =
      await seedChoreographyWithInscriptions(
        `congela.${crypto.randomUUID()}@example.com`,
        1,
        3000,
      );
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 3000,
    });

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: choreography.eventId },
      deps,
    );
    expect(outcome.ok).toBe(true);
    const emitted = outcome.ok ? outcome.comprobante : null;

    // Meses después entra un cobro de saldo (una reimputación posible): el
    // comprobante ya emitido no debe cambiar su porción ni sus fechas.
    await allocatePayment({
      academyId: academy.id,
      eventId: choreography.eventId,
      inscriptionId: inscriptions[0].id,
      amount: 7000,
    });

    const [reloaded] = await db
      .select({
        porcion: comprobantes.porcion,
        fchServDesde: comprobantes.fchServDesde,
        fchServHasta: comprobantes.fchServHasta,
        fchVtoPago: comprobantes.fchVtoPago,
      })
      .from(comprobantes)
      .where(eq(comprobantes.id, emitted!.id));
    expect(reloaded).toEqual({
      porcion: "seña",
      fchServDesde: "20260501",
      fchServHasta: "20260503",
      fchVtoPago: "20260722",
    });
  });

  test("rechaza una coreografía inexistente o de otro evento", async () => {
    const { choreography } = await seedChoreographyWithInscriptions(
      `evento.${crypto.randomUUID()}@example.com`,
      1,
    );

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitChoreographyFacturaC(
      { choreographyId: choreography.id, eventId: "otro-evento" },
      deps,
    );

    expect(outcome).toMatchObject({ ok: false, reason: "not-found" });
    expect(deps.billing.getLastVoucher).not.toHaveBeenCalled();
  });
});

// ARCA no responde (ADR-0012): la falla se clasifica por fase y, si se cortó
// autorizando, el servidor resuelve la ambigüedad consultando el comprobante
// exacto que intentó emitir.
describe("emitChoreographyFacturaC (ARCA no responde)", () => {
  // Coreografía con 5000 cobrados y nada facturado: el correlativo a intentar es
  // el 43 (`ultimoAutorizado` = 42).
  async function seedCobrado(prefix: string) {
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

  // `FECompConsultar` de la Factura C 43 tal como ARCA la registró.
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
    const outcome = await emitChoreographyFacturaC(
      { choreographyId, eventId },
      deps,
    );
    return { deps, outcome };
  }

  test("cortada la consulta del correlativo, no se emitió nada y no se consulta a ARCA", async () => {
    const choreography = await seedCobrado("lookup");

    const { deps, outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({ getLastVoucher: vi.fn(connectionLost) }),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "not-emitted" });
    expect(deps.billing.createVoucher).not.toHaveBeenCalled();
    // Nada que consultar: no se pidió autorizar ningún comprobante.
    expect(deps.billing.getVoucherInfo).not.toHaveBeenCalled();
    expect(await listChoreographyComprobantes(choreography.id)).toHaveLength(0);
  });

  test("el timeout de la consulta del correlativo cuenta como falla de comunicación", async () => {
    const choreography = await seedCobrado("lookup-timeout");

    const { outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({ getLastVoucher: vi.fn(neverAnswers) }),
      FAST_TIMEOUTS,
    );

    expect(outcome).toMatchObject({ ok: false, reason: "not-emitted" });
  });

  test("cortada la autorización, consulta el comprobante exacto y lo persiste con el CAE que ARCA devuelve", async () => {
    const choreography = await seedCobrado("recuperado");

    const { deps, outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({
        createVoucher: vi.fn(connectionLost),
        getVoucherInfo: vi.fn(async () => consultada()),
      }),
    );

    // Se consulta el punto de venta, tipo y correlativo que se intentó emitir.
    expect(deps.billing.getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
    // El CAE salió de la consulta, no de la autorización.
    expect(outcome).toMatchObject({ ok: true, recovered: true });

    const [persisted] = await listChoreographyComprobantes(choreography.id);
    expect(persisted).toMatchObject({
      cbteTipo: 11,
      cbteNro: 43,
      cbteFch: "20260722",
      impTotal: 5000,
      cae: "41124578989845",
      caeVto: "20260801",
      status: "vigente",
    });
    expect(persisted.lines).toHaveLength(1);
  });

  test("el timeout de autorización también dispara la recuperación", async () => {
    const choreography = await seedCobrado("auth-timeout");

    const { deps, outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({
        createVoucher: vi.fn(neverAnswers),
        getVoucherInfo: vi.fn(async () => consultada()),
      }),
      FAST_TIMEOUTS,
    );

    expect(deps.billing.getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
    expect(outcome.ok).toBe(true);
    expect(await listChoreographyComprobantes(choreography.id)).toHaveLength(1);
  });

  test("si ARCA no tiene ese comprobante, no se emitió nada y reintentar es seguro", async () => {
    const choreography = await seedCobrado("sin-comprobante");

    const { outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({
        createVoucher: vi.fn(connectionLost),
        getVoucherInfo: vi.fn(async () => null),
      }),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "not-emitted" });
    expect(await listChoreographyComprobantes(choreography.id)).toHaveLength(0);
  });

  // Mismo "ARCA no lo tiene" que el test anterior, pero llegando por timeout en
  // lugar de por caída de la conexión: la autorización sigue en vuelo, así que la
  // respuesta puede ser sólo "todavía no". Habilitar el reintento acá es lo que
  // emitiría un segundo comprobante por el mismo monto.
  test("si la autorización venció por timeout, que ARCA no lo tenga no habilita el reintento", async () => {
    const choreography = await seedCobrado("timeout-sin-comprobante");

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
    expect(await listChoreographyComprobantes(choreography.id)).toHaveLength(0);
  });

  test("si la consulta también falla, el resultado es no verificado y lleva el comprobante que no pudo resolver", async () => {
    const choreography = await seedCobrado("no-verificado");

    const { outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({
        createVoucher: vi.fn(connectionLost),
        getVoucherInfo: vi.fn(connectionLost),
      }),
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "unverified",
      attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
    });
    expect(await listChoreographyComprobantes(choreography.id)).toHaveLength(0);
  });

  // Los correlativos no se reservan: un comprobante con el número que intentamos
  // no es necesariamente el nuestro (ADR-0012 decisión 4).
  test("un comprobante consultado con otro importe no es el nuestro: no se persiste", async () => {
    const choreography = await seedCobrado("otro-importe");

    const { outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({
        createVoucher: vi.fn(connectionLost),
        getVoucherInfo: vi.fn(async () => consultada({ impTotal: 9999 })),
      }),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "unverified" });
    expect(await listChoreographyComprobantes(choreography.id)).toHaveLength(0);
  });

  test("un comprobante consultado con otra fecha tampoco es el nuestro", async () => {
    const choreography = await seedCobrado("otra-fecha");

    const { outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({
        createVoucher: vi.fn(connectionLost),
        getVoucherInfo: vi.fn(async () => consultada({ cbteFch: "20260101" })),
      }),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "unverified" });
    expect(await listChoreographyComprobantes(choreography.id)).toHaveLength(0);
  });

  describe("re-verificación (#577)", () => {
    async function recheckWith(
      choreographyId: string,
      eventId: string,
      billing: ArcaBillingPort,
      cbteNro = 43,
    ) {
      const deps = emissionDeps(billing);
      const outcome = await recheckChoreographyFacturaC(
        { choreographyId, eventId, cbteNro },
        deps,
      );
      return { deps, outcome };
    }

    test("el comprobante aparece en ARCA: se persiste con ese CAE y sin volver a autorizar", async () => {
      const choreography = await seedCobrado("recheck-recuperado");

      const { deps, outcome } = await recheckWith(
        choreography.id,
        choreography.eventId,
        fakeBilling({ getVoucherInfo: vi.fn(async () => consultada()) }),
      );

      expect(deps.billing.getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
      // Es la única salida que persiste un comprobante recuperado: verificar a
      // mano en el portal deja al operador sin nada que hacer con el dato.
      expect(outcome).toMatchObject({ ok: true, recovered: true });
      expect(deps.billing.createVoucher).not.toHaveBeenCalled();

      const [persisted] = await listChoreographyComprobantes(choreography.id);
      expect(persisted).toMatchObject({
        cbteNro: 43,
        impTotal: 5000,
        cae: "41124578989845",
        status: "vigente",
      });
    });

    // El importe con el que se valida sale del facturable de la coreografía, no
    // del form: un `cbteNro` adulterado o viejo no puede forzar la persistencia
    // de un CAE ajeno (ADR-0012 decisión 4).
    test("el importe lo recalcula el server: si el consultado no coincide, sigue sin verificar", async () => {
      const choreography = await seedCobrado("recheck-otro-importe");

      const { outcome } = await recheckWith(
        choreography.id,
        choreography.eventId,
        fakeBilling({
          getVoucherInfo: vi.fn(async () => consultada({ impTotal: 9999 })),
        }),
      );

      expect(outcome).toMatchObject({ ok: false, reason: "unverified" });
      expect(await listChoreographyComprobantes(choreography.id)).toHaveLength(
        0,
      );
    });

    // Sólo puede probar el positivo: nadie midió cuánto puede vivir una petición
    // del lado de ARCA, así que un `null` nunca asciende a `not-emitted`.
    test("si ARCA sigue sin tenerlo, se queda en no verificado y nunca en no emitido", async () => {
      const choreography = await seedCobrado("recheck-sin-comprobante");

      const { outcome } = await recheckWith(
        choreography.id,
        choreography.eventId,
        fakeBilling({ getVoucherInfo: vi.fn(async () => null) }),
      );

      expect(outcome).toMatchObject({
        ok: false,
        reason: "unverified",
        attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
      });
      expect(await listChoreographyComprobantes(choreography.id)).toHaveLength(
        0,
      );
    });
  });

  test("un rechazo de ARCA sigue siendo un rechazo, distinguible de una falla de comunicación", async () => {
    const choreography = await seedCobrado("rechazo-vs-contingencia");

    const { deps, outcome } = await emitWith(
      choreography.id,
      choreography.eventId,
      fakeBilling({ createVoucher: vi.fn(async () => facturaCRechazada) }),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "rejected" });
    // ARCA respondió: no hay nada que consultar.
    expect(deps.billing.getVoucherInfo).not.toHaveBeenCalled();
  });
});

describe("readFacturaCEmissionConfig", () => {
  test("lee el punto de venta, el CUIT emisor y la condición IVA del receptor", () => {
    const config = readFacturaCEmissionConfig({
      ARCA_PTOVTA: "1",
      ARCA_CUIT: "30717611590",
      ARCA_CONDICION_IVA_RECEPTOR_ID: "5",
    });

    expect(config).toEqual({
      ptoVta: 1,
      issuerCuit: "30717611590",
      receptorIvaConditionId: 5,
    });
  });

  test("rechaza un punto de venta no entero positivo", () => {
    expect(() =>
      readFacturaCEmissionConfig({
        ARCA_PTOVTA: "0",
        ARCA_CUIT: "30717611590",
        ARCA_CONDICION_IVA_RECEPTOR_ID: "5",
      }),
    ).toThrow(/ARCA_PTOVTA/);
  });

  test("exige el CUIT del emisor", () => {
    expect(() =>
      readFacturaCEmissionConfig({
        ARCA_PTOVTA: "1",
        ARCA_CONDICION_IVA_RECEPTOR_ID: "5",
      }),
    ).toThrow(/ARCA_CUIT/);
  });
});

import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
} from "@arcasdk/core";
import { eq } from "drizzle-orm";
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
  ultimoAutorizado,
} from "@/lib/comprobantes/arca/fixtures";
import {
  emitChoreographyFacturaC,
  readFacturaCEmissionConfig,
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
    ...overrides,
  };
}

// Deps de emisión con cliente ARCA mockeado (cero red) y `cbteFch` fija para no
// depender del reloj.
function emissionDeps(
  billing: ArcaBillingPort,
): FacturaCEmissionDeps & { billing: ArcaBillingPort } {
  return {
    billing,
    client: new ArcaClient(billing),
    ptoVta: 1,
    issuerCuit: "30717611590",
    receptorIvaConditionId: 5,
    cbteFch: "20260722",
  };
}

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
    allocationType: "deposit",
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

    expect(outcome.ok).toBe(true);
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

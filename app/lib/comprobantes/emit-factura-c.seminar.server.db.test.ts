import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  comprobantes,
  paymentAllocations,
  payments,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import { createDancer } from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  ArcaClient,
  type ArcaBillingPort,
} from "@/lib/comprobantes/arca/client.server";
import type { ArcaVoucher } from "@/lib/comprobantes/arca/factura-c";
import {
  facturaCAprobada,
  notaCreditoCAprobada,
  ultimoAutorizado,
} from "@/lib/comprobantes/arca/fixtures";
import { choreographyAnchor, seminarAnchor } from "@/lib/comprobantes/anchor";
import {
  listAnchorComprobantes,
  recordComprobante,
  seminarHasComprobantes,
} from "@/lib/comprobantes/comprobantes.server";
import {
  emitFacturaC,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import { annulComprobante } from "@/lib/comprobantes/emit-nota-credito.server";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import { createSavedEvent } from "@/lib/events/bases-test-fixtures.server.db";
import { deleteSeminar } from "@/lib/seminars/repository.server";
import { createAcademyUser } from "@/lib/test-support/academies";

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
    getVoucherInfo: vi.fn(
      async (): Promise<VoucherInfoResultDto | null> => null,
    ),
    ...overrides,
  };
}

/**
 * ARCA approving the NEXT number of the series, so two emissions can run in one
 * test without colliding on `(ptoVta, cbteTipo, cbteNro)`.
 */
function approvedAt(cbteNro: number, cae: string): CreateVoucherResultDto {
  return {
    ...facturaCAprobada,
    cae,
    response: {
      ...facturaCAprobada.response,
      FeDetResp: {
        FECAEDetResponse: [
          {
            ...facturaCAprobada.response.FeDetResp!.FECAEDetResponse![0],
            CbteDesde: cbteNro,
            CbteHasta: cbteNro,
            CAE: cae,
          },
        ],
      },
    },
  };
}

function nextInSeries(cbteNro: number, cae: string): ArcaBillingPort {
  return fakeBilling({
    createVoucher: vi.fn(
      async (): Promise<CreateVoucherResultDto> => approvedAt(cbteNro, cae),
    ),
    getLastVoucher: vi.fn(
      async (): Promise<LastVoucherResultDto> => ({
        ...ultimoAutorizado,
        cbteNro: cbteNro - 1,
      }),
    ),
  });
}

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

/**
 * One seminar of one event with two academies registered in it. Everything the
 * unit asserts needs the second academy: what makes `(seminar, academy)` the
 * obligation unit is precisely that the seminar alone is not one.
 */
async function seedSeminarUnit() {
  const event = await createSavedEvent(`Regional ${crypto.randomUUID()}`);

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

  await db.insert(seminarPrices).values({
    amount: 20000,
    eventId: event.id,
    forParticipants: false,
    kind: "regular",
    name: "Precio general",
    paymentDeadline: null,
  });

  const first = await seedRegisteredAcademy(event.id, seminar.id, "Norte");
  const second = await seedRegisteredAcademy(event.id, seminar.id, "Sur");

  return { event, first, seminar, second };
}

let paymentNumber = 0;

async function seedRegisteredAcademy(
  eventId: string,
  seminarId: string,
  academyName: string,
) {
  const academy = await createAcademyUser({
    academyName: `Academia ${academyName}`,
    email: `seminario.${crypto.randomUUID()}@example.com`,
  });
  const dancer = await createDancer(academy.academyId, {
    firstName: "Ana",
    lastName: academyName,
  });
  const [inscription] = await db
    .insert(seminarInscriptions)
    .values({ dancerId: dancer.id, seminarId })
    .returning();

  paymentNumber += 1;
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: academy.academyId,
      amount: 50000,
      eventId,
      paymentDate: "2030-04-01",
      paymentMethod: "transferencia",
      paymentNumber,
    })
    .returning();

  return { academyId: academy.academyId, inscription, payment };
}

async function allocate(
  unit: {
    academyId: string;
    inscription: { id: string };
    payment: { id: string };
  },
  eventId: string,
  amount: number,
) {
  await db.insert(paymentAllocations).values({
    academyId: unit.academyId,
    amount,
    eventId,
    paymentId: unit.payment.id,
    seminarInscriptionId: unit.inscription.id,
  });
}

/**
 * A second collection on the same inscription. It needs its own `Pago`: one
 * allocation row per `(payment, target)` is exactly what the unique constraint
 * says, and the summing upsert is the writer's job, not the fixture's.
 */
async function allocateMore(
  unit: { academyId: string; inscription: { id: string } },
  eventId: string,
  amount: number,
) {
  paymentNumber += 1;
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: unit.academyId,
      amount,
      eventId,
      paymentDate: "2030-05-01",
      paymentMethod: "transferencia",
      paymentNumber,
    })
    .returning();

  await db.insert(paymentAllocations).values({
    academyId: unit.academyId,
    amount,
    eventId,
    paymentId: payment.id,
    seminarInscriptionId: unit.inscription.id,
  });
}

describe("emitFacturaC on a (seminar, academy) unit", () => {
  test("bills what that academy collected in that seminar, anchored on the pair", async () => {
    const { event, first, seminar, second } = await seedSeminarUnit();
    await allocate(first, event.id, 6000);
    // The other academy's money in the same seminar is another unit's: it must
    // not reach this comprobante.
    await allocate(second, event.id, 9000);

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      { anchor: seminarAnchor(seminar.id, first.academyId), eventId: event.id },
      deps,
    );

    expect(outcome).toMatchObject({ ok: true, recovered: false });
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    expect(sent.ImpTotal).toBe(6000);
    // A seminar is taught on one day, so both ends of the service period are it.
    expect(sent.FchServDesde).toBe("20301010");
    expect(sent.FchServHasta).toBe("20301010");
    expect(sent.FchVtoPago).toBe("20260722");

    const [persisted] = await listAnchorComprobantes(
      seminarAnchor(seminar.id, first.academyId),
    );
    expect(persisted).toMatchObject({
      academyId: first.academyId,
      choreographyId: null,
      impTotal: 6000,
      seminarId: seminar.id,
      status: "vigente",
    });
    expect(persisted.lines).toHaveLength(1);
    expect(persisted.lines[0]).toMatchObject({
      choreographyInscriptionId: null,
      amount: 6000,
      seminarInscriptionId: first.inscription.id,
    });

    // The other academy's unit is untouched and still owes its whole collection.
    expect(
      await listAnchorComprobantes(seminarAnchor(seminar.id, second.academyId)),
    ).toHaveLength(0);
  });

  test("a second emission bills only the delta, and refuses when there is none", async () => {
    const { event, first, seminar } = await seedSeminarUnit();
    await allocate(first, event.id, 6000);
    const anchor = seminarAnchor(seminar.id, first.academyId);

    await emitFacturaC(
      { anchor, eventId: event.id },
      emissionDeps(fakeBilling()),
    );

    const refused = await emitFacturaC(
      { anchor, eventId: event.id },
      emissionDeps(fakeBilling()),
    );
    expect(refused).toMatchObject({
      ok: false,
      reason: "nothing-to-bill",
      message:
        "No hay un monto cobrado pendiente de facturar en este seminario.",
    });

    await allocateMore(first, event.id, 2500);
    const deps = emissionDeps(nextInSeries(44, "41124578989846"));
    const second = await emitFacturaC({ anchor, eventId: event.id }, deps);

    expect(second).toMatchObject({ ok: true });
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    expect(sent.ImpTotal).toBe(2500);
  });

  test("bills a withdrawn inscription as evidence of what it retained", async () => {
    const { event, first, seminar } = await seedSeminarUnit();
    await allocate(first, event.id, 6000);
    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: new Date("2030-05-01T12:00:00Z") })
      .where(eq(seminarInscriptions.id, first.inscription.id));

    const deps = emissionDeps(fakeBilling());
    const outcome = await emitFacturaC(
      { anchor: seminarAnchor(seminar.id, first.academyId), eventId: event.id },
      deps,
    );

    expect(outcome).toMatchObject({ ok: true });
    const sent = vi.mocked(deps.billing.createVoucher).mock
      .calls[0][0] as ArcaVoucher;
    expect(sent.ImpTotal).toBe(6000);
  });

  test("refuses an anchor that does not belong to the named event", async () => {
    const { first, seminar } = await seedSeminarUnit();
    const other = await createSavedEvent(`Otro ${crypto.randomUUID()}`);

    const outcome = await emitFacturaC(
      { anchor: seminarAnchor(seminar.id, first.academyId), eventId: other.id },
      emissionDeps(fakeBilling()),
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "not-found",
      message: "No encontramos ese seminario.",
    });
  });
});

describe("the comprobante anchor", () => {
  test("annulment and re-billing stay inside the anchor", async () => {
    const { event, first, seminar, second } = await seedSeminarUnit();
    await allocate(first, event.id, 6000);
    await allocate(second, event.id, 9000);
    const anchor = seminarAnchor(seminar.id, first.academyId);

    const emitted = await emitFacturaC(
      { anchor, eventId: event.id },
      emissionDeps(fakeBilling()),
    );
    expect(emitted.ok).toBe(true);
    const factura = emitted.ok ? emitted.comprobante : null;

    // The other academy's comprobante points at nothing of this one, so it
    // cannot annul it.
    await emitFacturaC(
      {
        anchor: seminarAnchor(seminar.id, second.academyId),
        eventId: event.id,
      },
      emissionDeps(nextInSeries(44, "41124578989846")),
    );

    const [stillVigente] = await listAnchorComprobantes(anchor);
    expect(stillVigente.status).toBe("vigente");

    const annulled = await annulComprobante(
      { comprobanteId: factura!.id },
      emissionDeps(
        fakeBilling({
          createVoucher: vi.fn(
            async (): Promise<CreateVoucherResultDto> => notaCreditoCAprobada,
          ),
        }),
      ),
    );
    expect(annulled.ok).toBe(true);

    const scope = await listAnchorComprobantes(anchor);
    // The mirror credit note anchors on the same pair, which is what derives
    // the invoice to `anulada` — and what keeps it out of the other unit.
    expect(scope).toHaveLength(2);
    expect(scope[0].status).toBe("anulada");
    expect(scope[1]).toMatchObject({
      academyId: first.academyId,
      cbteTipo: 13,
      seminarId: seminar.id,
    });
    expect(
      await listAnchorComprobantes(seminarAnchor(seminar.id, second.academyId)),
    ).toHaveLength(1);
  });

  test("refuses a root naming neither anchor and one naming both", async () => {
    const { event, first, seminar } = await seedSeminarUnit();
    const root = {
      academyId: first.academyId,
      cae: "74123456789012",
      caeVto: "20300801",
      cbteFch: "20300722",
      cbteNro: 1,
      cbteTipo: 11,
      eventId: event.id,
      impTotal: 10000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento" as const,
      ptoVta: 1,
      receptorDocNro: "0",
      receptorDocTipo: 99,
      receptorIvaConditionId: 5,
    };

    await expect(db.insert(comprobantes).values(root)).rejects.toThrow();
    await expect(
      db.insert(comprobantes).values({
        ...root,
        choreographyId: null,
        seminarId: seminar.id,
      }),
    ).resolves.toBeDefined();
  });

  test("a choreography comprobante takes its academy from its choreography", async () => {
    const event = await createSavedEvent(`Regional ${crypto.randomUUID()}`);
    const { academy, choreography } =
      await createAcademyFinanceChoreographyFixture({
        academyName: "Academia Coreografías",
        choreographyName: "Coreografía a facturar",
        email: `coreografias.${crypto.randomUUID()}@example.com`,
        event,
      });

    await recordComprobante({
      anchor: choreographyAnchor(choreography.id),
      eventId: event.id,
      cbteTipo: 11,
      ptoVta: 1,
      cbteNro: 1,
      cbteFch: "20300722",
      impTotal: 10000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      receptorDocTipo: 99,
      receptorDocNro: "0",
      receptorIvaConditionId: 5,
      cae: "74123456789012",
      caeVto: "20300801",
      lines: [],
    });

    const [persisted] = await listAnchorComprobantes(
      choreographyAnchor(choreography.id),
    );
    expect(persisted).toMatchObject({
      academyId: academy.academy.id,
      seminarId: null,
    });
  });
});

describe("seminar deletion with fiscal history", () => {
  test("is refused permanently once the seminar carries a comprobante", async () => {
    const { event, first, seminar } = await seedSeminarUnit();
    await allocate(first, event.id, 6000);
    await emitFacturaC(
      { anchor: seminarAnchor(seminar.id, first.academyId), eventId: event.id },
      emissionDeps(fakeBilling()),
    );

    expect(await seminarHasComprobantes(seminar.id)).toBe(true);

    // Even with every inscription gone — the state that otherwise opens the
    // delete — the fiscal history keeps refusing it.
    await db.delete(paymentAllocations);
    await db.delete(seminarInscriptions);

    await expect(deleteSeminar(seminar.id)).resolves.toMatchObject({
      ok: false,
      code: "has-comprobantes",
      error:
        "No se puede borrar el seminario porque tiene comprobantes emitidos.",
    });
  });
});

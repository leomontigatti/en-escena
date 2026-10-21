import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { and, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  comprobantes,
  paymentAllocations,
  payments,
} from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import {
  ArcaClient,
  type ArcaBillingPort,
} from "@/lib/comprobantes/arca/client.server";
import {
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "@/lib/comprobantes/arca/factura-c";
import {
  facturaCAprobada,
  facturaCConsultada,
  facturaCRechazada,
  ultimoAutorizado,
} from "@/lib/comprobantes/arca/wsfe-responses.test-support";
import { recordComprobante } from "@/lib/comprobantes/comprobantes.server";
import type { ComprobanteEmissionDeps } from "@/lib/comprobantes/emit-comprobante.server";
import { describeEmissionRefusal } from "@/lib/comprobantes/emission-plan";
import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import {
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
  recheckComprobanteIntent,
} from "@/features/admin/finances/comprobante-emission/shared";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";

import {
  handleChoreographyFinanceAction,
  loadChoreographyFinanceDetail,
} from "./server";

installDatabaseTestHooks();

const ADMIN_EMAIL = "admin.comprobantes.detalle@example.com";

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
    // Only queried when the authorization falls over: by default ARCA does not
    // have that comprobante.
    getVoucherInfo: vi.fn(
      async (): Promise<VoucherInfoResultDto | null> => null,
    ),
    ...overrides,
  };
}

function emissionDeps(billing: ArcaBillingPort): ComprobanteEmissionDeps {
  return {
    client: new ArcaClient(billing),
    ptoVta: 1,
    issuerCuit: "30717611590",
    receptorIvaConditionId: 5,
    cbteFch: "20260722",
  };
}

async function seedChoreographyWithPaidInscription(input: {
  academyName: string;
  choreographyName: string;
  email: string;
  paidAmount: number;
}) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: input.academyName,
      choreographyName: input.choreographyName,
      email: input.email,
      event,
    });
  // The catalogue's `solo` row expired in May; this one prices every
  // inscription at 10000 today, with a 3000 deposit.
  await insertTestPrices([
    {
      eventId: event.id,
      name: "Precio Solo vigente",
      groupType: "solo",
      amount: 10000,
      paymentDeadline: "2099-12-31",
    },
  ]);
  const dancer = await createDancer(academy.academy.id, {
    firstName: "Ana",
    lastName: "López",
  });
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();

  await seedAllocation({
    academyId: academy.academy.id,
    amount: input.paidAmount,
    eventId: event.id,
    inscriptionId: inscription.id,
    paymentNumber: 1,
  });

  return {
    academyId: academy.academy.id,
    choreographyId: choreography.id,
    eventId: event.id,
    inscriptionId: inscription.id,
  };
}

let paymentNumberSeq = 0;

async function seedAllocation(input: {
  academyId: string;
  amount: number;
  eventId: string;
  inscriptionId: string;
  paymentNumber?: number;
}) {
  paymentNumberSeq += 1;
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: input.academyId,
      amount: input.amount,
      eventId: input.eventId,
      paymentDate: "2026-07-22",
      paymentMethod: "transferencia",
      paymentNumber: input.paymentNumber ?? paymentNumberSeq,
    })
    .returning();

  await db.insert(paymentAllocations).values({
    academyId: input.academyId,
    amount: input.amount,
    eventId: input.eventId,
    choreographyInscriptionId: input.inscriptionId,
    paymentId: payment.id,
  });
}

async function recordValidInvoice(input: {
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
  amount: number;
  cbteNro: number;
}) {
  return await recordComprobante({
    anchor: choreographyAnchor(input.choreographyId),
    eventId: input.eventId,
    cbteTipo: FACTURA_C_CBTE_TIPO,
    ptoVta: 1,
    cbteNro: input.cbteNro,
    cbteFch: "20260722",
    impTotal: input.amount,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "74123456789012",
    caeVto: "20260801",
    lines: [
      { choreographyInscriptionId: input.inscriptionId, amount: input.amount },
    ],
  });
}

// A credit note mirroring an invoice: by referencing it through
// `associatedComprobanteId`, the invoice's derived state becomes `annulled`.
async function recordNotaCredito(input: {
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
  amount: number;
  cbteNro: number;
  associatedComprobanteId: string;
}) {
  return await recordComprobante({
    anchor: choreographyAnchor(input.choreographyId),
    eventId: input.eventId,
    cbteTipo: NOTA_CREDITO_C_CBTE_TIPO,
    ptoVta: 1,
    cbteNro: input.cbteNro,
    cbteFch: "20260722",
    impTotal: input.amount,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "74123456789013",
    caeVto: "20260801",
    associatedComprobanteId: input.associatedComprobanteId,
    lines: [
      { choreographyInscriptionId: input.inscriptionId, amount: input.amount },
    ],
  });
}

async function loadDetail(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}) {
  const { request } = await createSignedInRequest({
    email: ADMIN_EMAIL,
    role: "admin",
    requestUrl: detailUrl(input),
  });

  const data = await loadChoreographyFinanceDetail({
    params: {
      academyId: input.academyId,
      choreographyId: input.choreographyId,
    },
    request,
  });

  if (data.selectedEventId === null) {
    throw new Error("Expected an active event in the fixture.");
  }

  return data;
}

async function buildActionRequest(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  formData: Record<string, string>;
}) {
  const { request: seed } = await createSignedInRequest({
    email: ADMIN_EMAIL,
    role: "admin",
    requestUrl: detailUrl(input),
  });
  const cookie = seed.headers.get("cookie") ?? "";

  return new Request(detailUrl(input), {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(input.formData),
  });
}

function detailUrl(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}) {
  return `http://localhost/administracion/finanzas/${input.academyId}/coreografias/${input.choreographyId}?evento=${input.eventId}`;
}

describe("financial detail — comprobante emission axis", () => {
  test("offers the invoice for the full price once the choreography is `Señada`", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Sin Factura",
      choreographyName: "Coreografía sin factura",
      email: "academia.sin.factura@example.com",
      paidAmount: 3000,
    });

    const loaderData = await loadDetail(seeded);

    expect(loaderData.invoicing).toEqual({
      status: "ready",
      kind: "factura_c",
      amount: 10000,
    });
  });

  test("explains why a choreography below `Señada` cannot be invoiced", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Sin Seña",
      choreographyName: "Coreografía sin seña",
      email: "academia.sin.sena@example.com",
      paidAmount: 1000,
    });

    const loaderData = await loadDetail(seeded);

    expect(loaderData.invoicing).toEqual({
      status: "blocked",
      invoiced: false,
      ...describeEmissionRefusal("below-deposit"),
    });
  });

  test("owes nothing once the invoice documents the whole total", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Vigente",
      choreographyName: "Coreografía vigente",
      email: "academia.vigente@example.com",
      paidAmount: 3000,
    });
    await recordValidInvoice({
      choreographyId: seeded.choreographyId,
      eventId: seeded.eventId,
      inscriptionId: seeded.inscriptionId,
      amount: 10000,
      cbteNro: 7,
    });
    // Money collected after the invoice bills nothing: it was never the amount.
    await seedAllocation({
      academyId: seeded.academyId,
      amount: 2000,
      eventId: seeded.eventId,
      inscriptionId: seeded.inscriptionId,
    });

    const loaderData = await loadDetail(seeded);

    expect(loaderData.invoicing).toMatchObject({
      status: "blocked",
      invoiced: true,
    });
  });

  test("offers a debit note for a dancer added after the invoice", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Alta",
      choreographyName: "Coreografía alta",
      email: "academia.alta@example.com",
      paidAmount: 3000,
    });
    await recordValidInvoice({
      choreographyId: seeded.choreographyId,
      eventId: seeded.eventId,
      inscriptionId: seeded.inscriptionId,
      amount: 10000,
      cbteNro: 7,
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 15,
      choreographyId: seeded.choreographyId,
      dancerId: (
        await createDancer(seeded.academyId, {
          firstName: "Bruno",
          lastName: "Díaz",
        })
      ).id,
    });

    const loaderData = await loadDetail(seeded);

    expect(loaderData.invoicing).toEqual({
      status: "ready",
      kind: "nota_debito_c",
      amount: 10000,
    });
  });

  test("emits and redirects back to the detail on an approved CAE", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Emite",
      choreographyName: "Coreografía emite",
      email: "academia.emite@example.com",
      paidAmount: 3000,
    });

    const request = await buildActionRequest({
      ...seeded,
      formData: {
        intent: emitComprobanteIntent,
        confirm: emitComprobanteConfirmValue,
      },
    });

    const redirect = await handleChoreographyFinanceAction({
      params: {
        academyId: seeded.academyId,
        choreographyId: seeded.choreographyId,
      },
      request,
      resolveEmissionDeps: () => emissionDeps(fakeBilling()),
    }).catch((thrown) => thrown);

    expect(redirect).toBeInstanceOf(Response);
    expect((redirect as Response).status).toBe(302);

    const stored = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.choreographyId, seeded.choreographyId));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ impTotal: 10000, cbteTipo: 11 });
  });

  // Invoicing what a withdrawn choreography still holds is the reason it
  // survives at all: its inscriptions owe what they retained.
  test("emits for a withdrawn choreography, for the money it retained", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Retirada",
      choreographyName: "Coreografía retirada",
      email: "academia.retirada.factura@example.com",
      paidAmount: 3000,
    });
    const withdrawnAt = new Date("2026-04-10T12:00:00Z");
    await db
      .update(choreographies)
      .set({ withdrawnAt })
      .where(eq(choreographies.id, seeded.choreographyId));
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt })
      .where(eq(choreographyDancers.id, seeded.inscriptionId));

    const request = await buildActionRequest({
      ...seeded,
      formData: {
        intent: emitComprobanteIntent,
        confirm: emitComprobanteConfirmValue,
      },
    });
    const redirect = await handleChoreographyFinanceAction({
      params: {
        academyId: seeded.academyId,
        choreographyId: seeded.choreographyId,
      },
      request,
      resolveEmissionDeps: () => emissionDeps(fakeBilling()),
    }).catch((thrown) => thrown);

    expect((redirect as Response).status).toBe(302);
    await expect(
      db
        .select()
        .from(comprobantes)
        .where(eq(comprobantes.choreographyId, seeded.choreographyId)),
    ).resolves.toMatchObject([{ impTotal: 3000, cbteTipo: 11 }]);
  });

  test("surfaces ARCA contingency without persisting anything", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Contingencia",
      choreographyName: "Coreografía contingencia",
      email: "academia.contingencia@example.com",
      paidAmount: 3000,
    });

    const request = await buildActionRequest({
      ...seeded,
      formData: {
        intent: emitComprobanteIntent,
        confirm: emitComprobanteConfirmValue,
      },
    });

    const result = await handleChoreographyFinanceAction({
      params: {
        academyId: seeded.academyId,
        choreographyId: seeded.choreographyId,
      },
      request,
      resolveEmissionDeps: () =>
        emissionDeps(
          fakeBilling({
            createVoucher: vi.fn(async () => facturaCRechazada),
          }),
        ),
    });

    expect(result).toMatchObject({ status: "warning" });
    if (
      result.status === "warning" &&
      result.contingency.status === "rejected"
    ) {
      expect(result.contingency.resultado).toBe("R");
      expect(result.contingency.errors.length).toBeGreaterThan(0);
    } else {
      expect.unreachable("un rechazo de ARCA es una contingencia `rejected`");
    }

    const stored = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.choreographyId, seeded.choreographyId));
    expect(stored).toHaveLength(0);
  });

  // The emission was seen failing for up to 45 seconds and then finished fine:
  // switching to "done" without saying anything reads as a glitch (ADR-0012).
  test("a recovered emission redirects and reports through the flash session", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Recuperada",
      choreographyName: "Coreografía recuperada",
      email: "academia.recuperada@example.com",
      paidAmount: 3000,
    });

    const request = await buildActionRequest({
      ...seeded,
      formData: {
        intent: emitComprobanteIntent,
        confirm: emitComprobanteConfirmValue,
      },
    });

    const redirect = await handleChoreographyFinanceAction({
      params: {
        academyId: seeded.academyId,
        choreographyId: seeded.choreographyId,
      },
      request,
      resolveEmissionDeps: () =>
        emissionDeps(
          fakeBilling({
            createVoucher: vi.fn(() =>
              Promise.reject(new Error("socket hang up")),
            ),
            getVoucherInfo: vi.fn(async (): Promise<VoucherInfoResultDto> => ({
              ...facturaCConsultada,
              impTotal: 10000,
              cbteFch: "20260722",
            })),
          }),
        ),
    }).catch((thrown) => thrown);

    expect(redirect).toBeInstanceOf(Response);
    expect((redirect as Response).status).toBe(302);
    // The notice travels by flash session, not by `actionData`: the route
    // redirects.
    expect((redirect as Response).headers.get("set-cookie")).toContain(
      "ee-flash",
    );

    const stored = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.choreographyId, seeded.choreographyId));
    expect(stored).toHaveLength(1);
  });

  test("re-verification recovers the comprobante without leaving the dialog", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Re-verificada",
      choreographyName: "Coreografía re-verificada",
      email: "academia.reverificada@example.com",
      paidAmount: 3000,
    });

    const billing = fakeBilling({
      getVoucherInfo: vi.fn(async (): Promise<VoucherInfoResultDto> => ({
        ...facturaCConsultada,
        cbteDesde: 43,
        cbteHasta: 43,
        impTotal: 10000,
        cbteFch: "20260722",
      })),
    });

    const result = await handleChoreographyFinanceAction({
      params: {
        academyId: seeded.academyId,
        choreographyId: seeded.choreographyId,
      },
      request: await buildActionRequest({
        ...seeded,
        formData: {
          intent: recheckComprobanteIntent,
          cbteNro: "43",
        },
      }),
      resolveEmissionDeps: () => emissionDeps(billing),
    });

    // It does not cross a redirect: it arrives as alert state, distinguishable
    // from recovery during the original submit.
    expect(result).toEqual({
      status: "warning",
      contingency: { status: "recovered" },
    });
    expect(billing.createVoucher).not.toHaveBeenCalled();

    const stored = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.choreographyId, seeded.choreographyId));
    expect(stored).toHaveLength(1);
  });

  // The amount is re-planned by the server: a tampered
  // sequence number cannot force somebody else's CAE to be persisted
  // (decision 4).
  test("re-verifying someone else's sequence number stays unverified", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Ajena",
      choreographyName: "Coreografía ajena",
      email: "academia.ajena@example.com",
      paidAmount: 3000,
    });

    const result = await handleChoreographyFinanceAction({
      params: {
        academyId: seeded.academyId,
        choreographyId: seeded.choreographyId,
      },
      request: await buildActionRequest({
        ...seeded,
        formData: { intent: recheckComprobanteIntent, cbteNro: "999" },
      }),
      resolveEmissionDeps: () =>
        emissionDeps(
          fakeBilling({
            getVoucherInfo: vi.fn(async (): Promise<VoucherInfoResultDto> => ({
              ...facturaCConsultada,
              cbteDesde: 999,
              cbteHasta: 999,
              impTotal: 999999,
              cbteFch: "20260722",
            })),
          }),
        ),
    });

    expect(result).toMatchObject({
      status: "warning",
      contingency: { status: "unverified", cbteNro: 999 },
    });

    const stored = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.choreographyId, seeded.choreographyId));
    expect(stored).toHaveLength(0);
  });

  test("refuses to emit without the irreversible confirmation", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Sin Confirmar",
      choreographyName: "Coreografía sin confirmar",
      email: "academia.sin.confirmar@example.com",
      paidAmount: 3000,
    });

    const billing = fakeBilling();
    const request = await buildActionRequest({
      ...seeded,
      formData: { intent: emitComprobanteIntent },
    });

    const result = await handleChoreographyFinanceAction({
      params: {
        academyId: seeded.academyId,
        choreographyId: seeded.choreographyId,
      },
      request,
      resolveEmissionDeps: () => emissionDeps(billing),
    });

    expect(result).toMatchObject({ status: "error" });
    expect(billing.createVoucher).not.toHaveBeenCalled();

    const stored = await db
      .select()
      .from(comprobantes)
      .where(and(eq(comprobantes.choreographyId, seeded.choreographyId)));
    expect(stored).toHaveLength(0);
  });
});

describe("financial detail — the comprobantes tab", () => {
  test("lists no comprobante for a choreography never invoiced", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Sin Comprobantes",
      choreographyName: "Coreografía sin comprobantes",
      email: "academia.sin.comprobantes@example.com",
      paidAmount: 3000,
    });

    const loaderData = await loadDetail(seeded);

    expect(loaderData.comprobantes).toEqual([]);
  });

  test("lists every comprobante of the choreography, newest first", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Con Comprobantes",
      choreographyName: "Coreografía con comprobantes",
      email: "academia.con.comprobantes@example.com",
      paidAmount: 3000,
    });
    // Same day for both: the credit note is still the newer one.
    const invoice = await recordValidInvoice({
      choreographyId: seeded.choreographyId,
      eventId: seeded.eventId,
      inscriptionId: seeded.inscriptionId,
      amount: 3000,
      cbteNro: 7,
    });
    const creditNote = await recordNotaCredito({
      choreographyId: seeded.choreographyId,
      eventId: seeded.eventId,
      inscriptionId: seeded.inscriptionId,
      amount: 3000,
      cbteNro: 1,
      associatedComprobanteId: invoice.id,
    });

    const loaderData = await loadDetail(seeded);

    expect(loaderData.comprobantes).toEqual([
      {
        cbteFch: "20260722",
        cbteNro: 1,
        cbteTipo: NOTA_CREDITO_C_CBTE_TIPO,
        id: creditNote.id,
        impTotal: 3000,
        ptoVta: 1,
      },
      {
        cbteFch: "20260722",
        cbteNro: 7,
        cbteTipo: FACTURA_C_CBTE_TIPO,
        id: invoice.id,
        impTotal: 3000,
        ptoVta: 1,
      },
    ]);
  });
});

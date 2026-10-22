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
import {
  emitAnchorComprobante,
  type ComprobanteEmissionDeps,
} from "@/lib/comprobantes/emit-comprobante.server";
import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import { createAcademyFinanceChoreographyFixture } from "@/lib/admin/finances/finances.test-support";
import {
  abandonReservationIntent,
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
  recheckComprobanteIntent,
} from "@/features/admin/finances/comprobante-emission/shared";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createSavedEvent } from "@/lib/test-support/events";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";

import { loadAcademyFinances } from "../server";

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
    today: "2026-07-22",
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

    // The date defaults to today, and the floor names the series it is the
    // floor of.
    expect(loaderData.invoicing).toMatchObject({
      status: "ready",
      kind: "factura_c",
      amount: 10000,
      cbteFch: {
        today: getBusinessDateOnly(),
        max: getBusinessDateOnly(),
        floorDescription: expect.stringContaining("(Factura C, punto de venta"),
      },
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

    expect(loaderData.invoicing).toMatchObject({
      status: "blocked",
      invoiced: false,
      reasons: [{ code: "below-deposit" }],
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

    expect(loaderData.invoicing).toMatchObject({
      status: "ready",
      kind: "nota_debito_c",
      amount: 10000,
      cbteFch: {
        floorDescription: expect.stringContaining(
          "(Nota de débito C, punto de venta",
        ),
      },
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
        kind: "factura_c",
        amount: "10000",
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
        kind: "factura_c",
        amount: "3000",
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
        kind: "factura_c",
        amount: "10000",
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
        kind: "factura_c",
        amount: "10000",
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

  // An authorization ARCA dropped, followed by a lookup that failed too:
  // invoice 43 stays reserved and unverified. It goes straight to the emitter:
  // the route signs in once per test.
  async function leaveUnverified(seeded: {
    choreographyId: string;
    eventId: string;
  }) {
    const outcome = await emitAnchorComprobante(
      {
        anchor: choreographyAnchor(seeded.choreographyId),
        eventId: seeded.eventId,
      },
      emissionDeps(
        fakeBilling({
          createVoucher: vi.fn(async () => {
            throw new Error("socket hang up");
          }),
          getVoucherInfo: vi.fn(async () => {
            throw new Error("socket hang up");
          }),
        }),
      ),
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "unverified",
      attempt: { cbteTipo: 11, cbteNro: 43 },
    });
  }

  test("re-verification recovers the comprobante without leaving the dialog", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Re-verificada",
      choreographyName: "Coreografía re-verificada",
      email: "academia.reverificada@example.com",
      paidAmount: 3000,
    });
    await leaveUnverified(seeded);

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
          cbteTipo: "11",
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

  // Only a reservation identifies an attempt: a tampered or stale number that
  // no attempt holds cannot get somebody else's CAE recorded.
  test("re-verifying a number no attempt holds records nothing", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Ajena",
      choreographyName: "Coreografía ajena",
      email: "academia.ajena@example.com",
      paidAmount: 3000,
    });
    const billing = fakeBilling({
      getVoucherInfo: vi.fn(async (): Promise<VoucherInfoResultDto> => ({
        ...facturaCConsultada,
        cbteDesde: 999,
        cbteHasta: 999,
        impTotal: 999999,
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
          cbteTipo: "11",
          cbteNro: "999",
        },
      }),
      resolveEmissionDeps: () => emissionDeps(billing),
    });

    expect(result).toMatchObject({
      status: "warning",
      contingency: { status: "not-emitted" },
    });
    expect(billing.getVoucherInfo).not.toHaveBeenCalled();

    const stored = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.choreographyId, seeded.choreographyId));
    expect(stored).toHaveLength(0);
  });

  test("the operator's verification abandons the attempt and frees the series", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Verificada",
      choreographyName: "Coreografía verificada",
      email: "academia.verificada@example.com",
      paidAmount: 3000,
    });
    await leaveUnverified(seeded);

    const result = await handleChoreographyFinanceAction({
      params: {
        academyId: seeded.academyId,
        choreographyId: seeded.choreographyId,
      },
      request: await buildActionRequest({
        ...seeded,
        formData: {
          intent: abandonReservationIntent,
          cbteTipo: "11",
          cbteNro: "43",
        },
      }),
      resolveEmissionDeps: () => emissionDeps(fakeBilling()),
    });

    expect(result).toEqual({
      status: "warning",
      contingency: { status: "released" },
    });
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

describe("financial detail — what the documents leave pending", () => {
  type Seeded = { academyId: string; choreographyId: string; eventId: string };

  // One sign-in per test: the detail is read before and after the emission.
  async function signIn(seeded: Seeded) {
    const { request } = await createSignedInRequest({
      email: ADMIN_EMAIL,
      role: "admin",
      requestUrl: detailUrl(seeded),
    });
    const cookie = request.headers.get("cookie") ?? "";

    return {
      // The academy's finance list, read with the same session.
      list: async () =>
        await loadAcademyFinances({
          params: { academyId: seeded.academyId },
          request: new Request(
            `http://localhost/administracion/finanzas/${seeded.academyId}?evento=${seeded.eventId}`,
            { headers: { cookie } },
          ),
        }),
      load: async () =>
        await loadChoreographyFinanceDetail({
          params: {
            academyId: seeded.academyId,
            choreographyId: seeded.choreographyId,
          },
          request: new Request(detailUrl(seeded), { headers: { cookie } }),
        }),
      emit: async (note: { kind: string; amount: number }) =>
        await emitOwedNote(
          seeded,
          new Request(detailUrl(seeded), {
            method: "POST",
            headers: {
              cookie,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              intent: emitComprobanteIntent,
              confirm: emitComprobanteConfirmValue,
              kind: note.kind,
              amount: String(note.amount),
            }),
          }),
        ),
    };
  }

  async function emitOwedNote(seeded: Seeded, request: Request) {
    const redirect = await handleChoreographyFinanceAction({
      params: {
        academyId: seeded.academyId,
        choreographyId: seeded.choreographyId,
      },
      request,
      resolveEmissionDeps: () => emissionDeps(fakeBilling()),
    }).catch((thrown) => thrown);

    expect((redirect as Response).status).toBe(302);
  }

  test("a dancer added after invoicing reads `Sin facturar` under a pending debit, and the debit note clears both", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Suma",
      choreographyName: "Coreografía suma",
      email: "academia.suma@example.com",
      paidAmount: 3000,
    });
    await recordValidInvoice({
      choreographyId: seeded.choreographyId,
      eventId: seeded.eventId,
      inscriptionId: seeded.inscriptionId,
      amount: 10000,
      cbteNro: 7,
    });
    const [added] = await db
      .insert(choreographyDancers)
      .values({
        ageAtEventStart: 15,
        choreographyId: seeded.choreographyId,
        dancerId: (
          await createDancer(seeded.academyId, {
            firstName: "Bruno",
            lastName: "Díaz",
          })
        ).id,
      })
      .returning();

    const session = await signIn(seeded);
    const pending = await session.load();

    expect(pending.choreography?.anomalies).toEqual(["pendingDebitNote"]);
    expect(pending.billing).toMatchObject({
      anomaly: "pendingDebitNote",
      amount: 10000,
      creditClockDays: null,
    });
    expect(
      pending.inscriptions
        .filter((inscription) => inscription.uninvoiced)
        .map((inscription) => inscription.inscriptionId),
    ).toEqual([added.id]);

    await session.emit({ kind: "nota_debito_c", amount: 10000 });
    const settled = await session.load();

    expect(settled.choreography?.anomalies).toEqual([]);
    expect(settled.billing).toMatchObject({ anomaly: null });
    expect(
      settled.inscriptions.some((inscription) => inscription.uninvoiced),
    ).toBe(false);
  });

  test("a withdrawal after invoicing leaves a pending credit counting days, and the credit note clears it", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Baja",
      choreographyName: "Coreografía baja",
      email: "academia.baja@example.com",
      paidAmount: 3000,
    });
    await recordValidInvoice({
      choreographyId: seeded.choreographyId,
      eventId: seeded.eventId,
      inscriptionId: seeded.inscriptionId,
      amount: 10000,
      cbteNro: 7,
    });
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: new Date(Date.now() - 4 * 86_400_000) })
      .where(eq(choreographyDancers.id, seeded.inscriptionId));

    const session = await signIn(seeded);
    const pending = await session.load();

    // The row retains its 3000 deposit: 7000 of its line is owed back.
    expect(pending.choreography?.anomalies).toEqual(["pendingCreditNote"]);
    expect(pending.billing).toMatchObject({
      anomaly: "pendingCreditNote",
      amount: 7000,
      creditClockDays: 4,
    });
    expect((await session.list()).choreographyFinanceRows).toMatchObject([
      { anomalies: ["pendingCreditNote"], creditClockDays: 4 },
    ]);

    await session.emit({ kind: "nota_credito_c", amount: 7000 });
    const settled = await session.load();

    expect(settled.billing).toMatchObject({
      anomaly: null,
      creditClockDays: null,
    });
    expect((await session.list()).choreographyFinanceRows).toMatchObject([
      { anomalies: [], creditClockDays: null },
    ]);
  });

  test("before the invoice there is nothing pending and no row reads `Sin facturar`", async () => {
    const seeded = await seedChoreographyWithPaidInscription({
      academyName: "Academia Previa",
      choreographyName: "Coreografía previa",
      email: "academia.previa@example.com",
      paidAmount: 3000,
    });

    const loaderData = await loadDetail(seeded);

    expect(loaderData.billing).toBeNull();
    expect(
      loaderData.inscriptions.some((inscription) => inscription.uninvoiced),
    ).toBe(false);
  });
});

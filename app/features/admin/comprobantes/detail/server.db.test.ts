import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographyDancers, comprobantes, payments } from "@/db/schema";
import { paymentAllocations } from "@/db/schema";
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
  facturaCRechazada,
  notaCreditoCAprobada,
  notaCreditoCConsultada,
  ultimoNotaCreditoAutorizado,
} from "@/lib/comprobantes/arca/fixtures";
import { recordComprobante } from "@/lib/comprobantes/comprobantes.server";
import type { FacturaCEmissionDeps } from "@/lib/comprobantes/emit-factura-c.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
} from "../../../../lib/admin/finances/finances.test-support";

import { handleComprobanteDetailAction, loadComprobanteDetail } from "./server";
import {
  annulComprobanteConfirmValue,
  annulComprobanteIntent,
  recheckNotaCreditoIntent,
} from "./shared";

installDatabaseTestHooks();

const ADMIN_EMAIL = "admin.comprobante.detalle@example.com";

// Mocked WSFEv1: the last-number lookup returns the type 13 series and emission
// approves the Nota de crédito. Each test overrides what it needs.
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
    // Only queried when the authorization falls over: by default ARCA does not
    // have that comprobante.
    getVoucherInfo: vi.fn(
      async (): Promise<VoucherInfoResultDto | null> => null,
    ),
    ...overrides,
  };
}

function emissionDeps(billing: ArcaBillingPort): FacturaCEmissionDeps {
  return {
    client: new ArcaClient(billing),
    ptoVta: 1,
    issuerCuit: "30717611590",
    receptorIvaConditionId: 5,
    cbteFch: "20260722",
  };
}

let paymentNumberSeq = 0;

async function seedComprobante(input: {
  academyName: string;
  choreographyName: string;
  email: string;
}) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: input.academyName,
      choreographyName: input.choreographyName,
      email: input.email,
      event,
    });
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

  paymentNumberSeq += 1;
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: academy.academy.id,
      amount: 7000,
      eventId: event.id,
      paymentDate: "2026-07-22",
      paymentMethod: "transferencia",
      paymentNumber: paymentNumberSeq,
    })
    .returning();
  await db.insert(paymentAllocations).values({
    academyId: academy.academy.id,
    amount: 7000,
    eventId: event.id,
    inscriptionId: inscription.id,
    paymentId: payment.id,
  });

  const factura = await recordComprobante({
    choreographyId: choreography.id,
    eventId: event.id,
    cbteTipo: FACTURA_C_CBTE_TIPO,
    ptoVta: 1,
    cbteNro: 41,
    cbteFch: "20260722",
    fchServDesde: "20260801",
    fchServHasta: "20260803",
    fchVtoPago: "20260722",
    impTotal: 7000,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "74123456789012",
    caeVto: "20260801",
    lines: [{ inscriptionId: inscription.id, amount: 7000 }],
  });

  return {
    academyId: academy.academy.id,
    choreographyId: choreography.id,
    eventId: event.id,
    facturaId: factura.id,
  };
}

function detailUrl(comprobanteId: string) {
  return `http://localhost/administracion/comprobantes/${comprobanteId}`;
}

async function signedInGetRequest(comprobanteId: string) {
  const { request } = await createSignedInRequest({
    email: ADMIN_EMAIL,
    role: "admin",
    requestUrl: detailUrl(comprobanteId),
  });

  return request;
}

async function annulRequest(input: {
  comprobanteId: string;
  formData: Record<string, string>;
}) {
  const { request: seed } = await createSignedInRequest({
    email: ADMIN_EMAIL,
    role: "admin",
    requestUrl: detailUrl(input.comprobanteId),
  });
  const cookie = seed.headers.get("cookie") ?? "";

  return new Request(detailUrl(input.comprobanteId), {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(input.formData),
  });
}

describe.sequential("loadComprobanteDetail", () => {
  test("loads the comprobante snapshot with its anchoring context", async () => {
    const seeded = await seedComprobante({
      academyName: "Academia Detalle",
      choreographyName: "Coreografía detalle",
      email: "academia.detalle@example.com",
    });

    const { comprobante } = await loadComprobanteDetail(
      await signedInGetRequest(seeded.facturaId),
      seeded.facturaId,
    );

    expect(comprobante.id).toBe(seeded.facturaId);
    expect(comprobante.cbteTipo).toBe(FACTURA_C_CBTE_TIPO);
    expect(comprobante.cbteNro).toBe(41);
    expect(comprobante.impTotal).toBe(7000);
    expect(comprobante.academyName).toBe("Academia Detalle");
    expect(comprobante.choreographyName).toBe("Coreografía detalle");
    expect(comprobante.fchServDesde).toBe("20260801");
    expect(comprobante.fchServHasta).toBe("20260803");
    expect(comprobante.status).toBe("vigente");
    expect(comprobante.canAnnul).toBe(true);
  });

  test("404s when the comprobante does not exist", async () => {
    await expect(
      loadComprobanteDetail(await signedInGetRequest("missing"), "missing"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe.sequential("handleComprobanteDetailAction — anular", () => {
  test("emits the mirroring Nota de crédito and redirects to the detail", async () => {
    const seeded = await seedComprobante({
      academyName: "Academia Anular",
      choreographyName: "Coreografía anular",
      email: "academia.anular@example.com",
    });
    const billing = fakeBilling();

    const outcome = await handleComprobanteDetailAction({
      request: await annulRequest({
        comprobanteId: seeded.facturaId,
        formData: {
          intent: annulComprobanteIntent,
          confirm: annulComprobanteConfirmValue,
        },
      }),
      comprobanteId: seeded.facturaId,
      resolveEmissionDeps: () => emissionDeps(billing),
    }).then(
      () => {
        throw new Error("Expected the annul action to redirect.");
      },
      (thrown) => thrown as Response,
    );

    expect(outcome).toBeInstanceOf(Response);
    expect(outcome.status).toBe(302);
    expect(outcome.headers.get("location")).toBe(
      `/administracion/comprobantes/${seeded.facturaId}`,
    );

    const notas = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.associatedComprobanteId, seeded.facturaId));

    expect(notas).toHaveLength(1);
    expect(notas[0].cbteTipo).toBe(NOTA_CREDITO_C_CBTE_TIPO);
  });

  test("rejects an annul submit without the confirmation keyword", async () => {
    const seeded = await seedComprobante({
      academyName: "Academia Sin Confirmar",
      choreographyName: "Coreografía sin confirmar",
      email: "academia.sin.confirmar@example.com",
    });
    const billing = fakeBilling();

    const result = await handleComprobanteDetailAction({
      request: await annulRequest({
        comprobanteId: seeded.facturaId,
        formData: { intent: annulComprobanteIntent, confirm: "" },
      }),
      comprobanteId: seeded.facturaId,
      resolveEmissionDeps: () => emissionDeps(billing),
    });

    expect(result).toEqual({
      status: "error",
      message: expect.stringContaining("Confirmá"),
    });
    expect(billing.createVoucher).not.toHaveBeenCalled();
  });

  test("surfaces an ARCA rejection as a rejected contingency without persisting", async () => {
    const seeded = await seedComprobante({
      academyName: "Academia Rechazo",
      choreographyName: "Coreografía rechazo",
      email: "academia.rechazo@example.com",
    });
    const billing = fakeBilling({
      createVoucher: vi.fn(
        async (): Promise<CreateVoucherResultDto> => facturaCRechazada,
      ),
    });

    const result = await handleComprobanteDetailAction({
      request: await annulRequest({
        comprobanteId: seeded.facturaId,
        formData: {
          intent: annulComprobanteIntent,
          confirm: annulComprobanteConfirmValue,
        },
      }),
      comprobanteId: seeded.facturaId,
      resolveEmissionDeps: () => emissionDeps(billing),
    });

    expect(result).toMatchObject({
      status: "contingency",
      contingency: { status: "rejected", resultado: "R" },
    });

    const notas = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.associatedComprobanteId, seeded.facturaId));
    expect(notas).toHaveLength(0);
  });
});

describe("handleComprobanteDetailAction — re-verificar (#577)", () => {
  // Nota de crédito 8 as ARCA recorded it: the same amount and date that were
  // sent, so it is ours (ADR-0012 decision 4).
  function consultada(
    overrides: Partial<VoucherInfoResultDto> = {},
  ): VoucherInfoResultDto {
    return {
      ...notaCreditoCConsultada,
      impTotal: 7000,
      cbteFch: "20260722",
      ...overrides,
    };
  }

  async function recheck(
    comprobanteId: string,
    billing: ArcaBillingPort,
    cbteNro = "8",
  ) {
    return await handleComprobanteDetailAction({
      request: await annulRequest({
        comprobanteId,
        formData: { intent: recheckNotaCreditoIntent, cbteNro },
      }),
      comprobanteId,
      resolveEmissionDeps: () => emissionDeps(billing),
    });
  }

  test("the nota de crédito shows up in ARCA: it is persisted and the alert is marked recovered", async () => {
    const seeded = await seedComprobante({
      academyName: "Academia Re-verificar",
      choreographyName: "Coreografía re-verificar",
      email: "academia.reverificar@example.com",
    });
    const billing = fakeBilling({
      getVoucherInfo: vi.fn(async () => consultada()),
    });

    const result = await recheck(seeded.facturaId, billing);

    expect(billing.getVoucherInfo).toHaveBeenCalledWith(8, 1, 13);
    // It does not retry the authorization: re-verification is only
    // `FECompConsultar`.
    expect(billing.createVoucher).not.toHaveBeenCalled();
    // It stays in the dialog: it does not cross a redirect.
    expect(result).toEqual({
      status: "contingency",
      contingency: { status: "recovered" },
    });

    const notas = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.associatedComprobanteId, seeded.facturaId));
    expect(notas).toHaveLength(1);
    expect(notas[0]).toMatchObject({
      cbteTipo: NOTA_CREDITO_C_CBTE_TIPO,
      cbteNro: 8,
      impTotal: 7000,
    });
  });

  // The amount comes from the comprobante being annulled, not from the form.
  test("a queried amount that does not match leaves the status unverified", async () => {
    const seeded = await seedComprobante({
      academyName: "Academia Re-verificar Ajena",
      choreographyName: "Coreografía re-verificar ajena",
      email: "academia.reverificar.ajena@example.com",
    });

    const result = await recheck(
      seeded.facturaId,
      fakeBilling({
        getVoucherInfo: vi.fn(async () => consultada({ impTotal: 999999 })),
      }),
    );

    expect(result).toMatchObject({
      status: "contingency",
      contingency: { status: "unverified", cbteTipo: 13, cbteNro: 8 },
    });

    const notas = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.associatedComprobanteId, seeded.facturaId));
    expect(notas).toHaveLength(0);
  });

  // It can only prove the positive: nobody has measured how long a request can
  // live on ARCA's side (ADR-0012 decision 2).
  test("ARCA still not having it never escalates to not emitted", async () => {
    const seeded = await seedComprobante({
      academyName: "Academia Sin Nota",
      choreographyName: "Coreografía sin nota",
      email: "academia.sin.nota@example.com",
    });

    const result = await recheck(
      seeded.facturaId,
      fakeBilling({ getVoucherInfo: vi.fn(async () => null) }),
    );

    expect(result).toMatchObject({
      status: "contingency",
      contingency: { status: "unverified" },
    });
  });
});

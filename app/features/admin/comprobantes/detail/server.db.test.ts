import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
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
  ultimoNotaCreditoAutorizado,
} from "@/lib/comprobantes/arca/fixtures";
import { recordComprobante } from "@/lib/comprobantes/comprobantes.server";
import type { FacturaCEmissionDeps } from "@/lib/comprobantes/emit-factura-c.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import {
  createAccountCurrentChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
} from "../../../../lib/admin/academies/account-current-route.test-support";

import { handleComprobanteDetailAction, loadComprobanteDetail } from "./server";
import { annulComprobanteConfirmValue, annulComprobanteIntent } from "./shared";

installDatabaseTestHooks();

const ADMIN_EMAIL = "admin.comprobante.detalle@example.com";

// WSFEv1 mockeado: la consulta del último devuelve la serie tipo 13 y la emisión
// aprueba la Nota de crédito. Cada test sobrescribe lo que necesita.
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
  porcion?: "seña" | "saldo" | "total";
}) {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const { academy, choreography } =
    await createAccountCurrentChoreographyFixture({
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
    allocationType: "deposit",
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
    porcion: input.porcion ?? "seña",
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
      porcion: "seña",
    });

    const { comprobante } = await loadComprobanteDetail(
      await signedInGetRequest(seeded.facturaId),
      seeded.facturaId,
    );

    expect(comprobante.id).toBe(seeded.facturaId);
    expect(comprobante.cbteTipo).toBe(FACTURA_C_CBTE_TIPO);
    expect(comprobante.cbteNro).toBe(41);
    expect(comprobante.porcion).toBe("seña");
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

  test("surfaces an ARCA rejection as an annul-error without persisting", async () => {
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

    expect(result.status).toBe("annul-error");

    const notas = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.associatedComprobanteId, seeded.facturaId));
    expect(notas).toHaveLength(0);
  });
});

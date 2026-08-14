import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { and, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
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
} from "@/lib/comprobantes/arca/fixtures";
import { recordComprobante } from "@/lib/comprobantes/comprobantes.server";
import type { FacturaCEmissionDeps } from "@/lib/comprobantes/emit-factura-c.server";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";
import {
  createAcademyFinanceChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
} from "../../../../../lib/admin/finances/finances.test-support";

import {
  handleChoreographyFinanceAction,
  loadChoreographyFinanceDetail,
} from "./server";
import {
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
  recheckComprobanteIntent,
} from "./shared";

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
    // Sólo se consulta cuando la autorización se cae: por defecto ARCA no tiene
    // ese comprobante.
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
    inscriptionId: input.inscriptionId,
    paymentId: payment.id,
  });
}

async function recordVigenteFactura(input: {
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
  amount: number;
  cbteNro: number;
}) {
  return await recordComprobante({
    choreographyId: input.choreographyId,
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
    lines: [{ inscriptionId: input.inscriptionId, amount: input.amount }],
  });
}

// Nota de crédito que espeja una factura: al referenciarla por
// `associatedComprobanteId`, el estado derivado de la factura pasa a `anulada`.
async function recordNotaCredito(input: {
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
  amount: number;
  cbteNro: number;
  associatedComprobanteId: string;
}) {
  return await recordComprobante({
    choreographyId: input.choreographyId,
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
    lines: [{ inscriptionId: input.inscriptionId, amount: input.amount }],
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

describe.sequential(
  "detalle financiero — eje de emisión de comprobantes",
  () => {
    test("has the whole cobro billable when no comprobante covers it yet", async () => {
      const seeded = await seedChoreographyWithPaidInscription({
        academyName: "Academia Sin Factura",
        choreographyName: "Coreografía sin factura",
        email: "academia.sin.factura@example.com",
        paidAmount: 3000,
      });

      const loaderData = await loadDetail(seeded);

      expect(loaderData.invoicing).toEqual({
        billableAmount: 3000,
        canEmit: true,
      });
    });

    test("leaves nothing billable once a vigente factura covers the whole cobro", async () => {
      const seeded = await seedChoreographyWithPaidInscription({
        academyName: "Academia Vigente",
        choreographyName: "Coreografía vigente",
        email: "academia.vigente@example.com",
        paidAmount: 3000,
      });
      await recordVigenteFactura({
        choreographyId: seeded.choreographyId,
        eventId: seeded.eventId,
        inscriptionId: seeded.inscriptionId,
        amount: 3000,
        cbteNro: 7,
      });

      const loaderData = await loadDetail(seeded);

      expect(loaderData.invoicing).toEqual({
        billableAmount: 0,
        canEmit: false,
      });
    });

    test("makes money collected after a factura billable again", async () => {
      const seeded = await seedChoreographyWithPaidInscription({
        academyName: "Academia Remanente",
        choreographyName: "Coreografía remanente",
        email: "academia.remanente@example.com",
        paidAmount: 3000,
      });
      await recordVigenteFactura({
        choreographyId: seeded.choreographyId,
        eventId: seeded.eventId,
        inscriptionId: seeded.inscriptionId,
        amount: 3000,
        cbteNro: 7,
      });
      await seedAllocation({
        academyId: seeded.academyId,
        amount: 2000,
        eventId: seeded.eventId,
        inscriptionId: seeded.inscriptionId,
      });

      const loaderData = await loadDetail(seeded);

      expect(loaderData.invoicing).toEqual({
        billableAmount: 2000,
        canEmit: true,
      });
    });

    test("makes the annulled factura's amount billable again", async () => {
      const seeded = await seedChoreographyWithPaidInscription({
        academyName: "Academia Anulada",
        choreographyName: "Coreografía anulada",
        email: "academia.anulada@example.com",
        paidAmount: 3000,
      });
      const factura = await recordVigenteFactura({
        choreographyId: seeded.choreographyId,
        eventId: seeded.eventId,
        inscriptionId: seeded.inscriptionId,
        amount: 3000,
        cbteNro: 7,
      });
      await recordNotaCredito({
        choreographyId: seeded.choreographyId,
        eventId: seeded.eventId,
        inscriptionId: seeded.inscriptionId,
        amount: 3000,
        cbteNro: 8,
        associatedComprobanteId: factura.id,
      });

      const loaderData = await loadDetail(seeded);

      expect(loaderData.invoicing).toEqual({
        billableAmount: 3000,
        canEmit: true,
      });
    });

    test("keeps canEmit aligned with the server gate when a billed line is orphaned", async () => {
      // An orphaned billed line — its allocation was deleted after emission —
      // leaves the aggregate billed above the aggregate collected while another
      // inscription still has a remainder. The remainder is resolved per
      // inscription, so B's is still billable and the button enables. That the
      // server accepts exactly that emission is asserted in
      // `emit-factura-c.server.db.test.ts`, which emits from this same state and
      // checks the `ImpTotal`; without it this test would only be restating the
      // loader. Under `porcion` the case was blocked on both sides, because the
      // aggregate portion was not derivable.
      const event = await createSavedEvent({ requiredDepositPercentage: 30 });
      const { academy, choreography } =
        await createAcademyFinanceChoreographyFixture({
          academyName: "Academia Huérfana",
          choreographyName: "Coreografía huérfana",
          email: "academia.huerfana@example.com",
          event,
        });
      const [dancerA, dancerB] = await Promise.all([
        createDancer(academy.academy.id, {
          firstName: "Ana",
          lastName: "López",
        }),
        createDancer(academy.academy.id, {
          firstName: "Bruno",
          lastName: "Díaz",
        }),
      ]);
      const [inscriptionA] = await db
        .insert(choreographyDancers)
        .values({
          ageAtEventStart: 14,
          choreographyId: choreography.id,
          dancerId: dancerA.id,
        })
        .returning();
      const [inscriptionB] = await db
        .insert(choreographyDancers)
        .values({
          ageAtEventStart: 15,
          choreographyId: choreography.id,
          dancerId: dancerB.id,
        })
        .returning();

      // A cobra 3000 y se factura entera (línea facturada de 3000).
      await seedAllocation({
        academyId: academy.academy.id,
        amount: 3000,
        eventId: event.id,
        inscriptionId: inscriptionA.id,
      });
      await recordVigenteFactura({
        choreographyId: choreography.id,
        eventId: event.id,
        inscriptionId: inscriptionA.id,
        amount: 3000,
        cbteNro: 7,
      });
      // B cobra sólo 1000 (menos que la línea facturada de A).
      await seedAllocation({
        academyId: academy.academy.id,
        amount: 1000,
        eventId: event.id,
        inscriptionId: inscriptionB.id,
      });
      // Se borra la asignación de A: su línea facturada queda huérfana y el
      // agregado facturado (3000) supera al cobrado (1000).
      await db
        .delete(paymentAllocations)
        .where(eq(paymentAllocations.inscriptionId, inscriptionA.id));

      const loaderData = await loadDetail({
        academyId: academy.academy.id,
        choreographyId: choreography.id,
        eventId: event.id,
      });

      expect(loaderData.invoicing).toEqual({
        billableAmount: 1000,
        canEmit: true,
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
      expect(stored[0]).toMatchObject({ impTotal: 3000, cbteTipo: 11 });
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

      expect(result).toMatchObject({ status: "contingency" });
      if (
        result.status === "contingency" &&
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

    // Se vio fallar la emisión durante hasta 45 segundos y terminó bien: pasar a
    // "listo" sin decir nada se lee como un glitch (ADR-0012).
    test("una emisión recuperada redirige avisando por flash session", async () => {
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
              getVoucherInfo: vi.fn(
                async (): Promise<VoucherInfoResultDto> => ({
                  ...facturaCConsultada,
                  impTotal: 3000,
                  cbteFch: "20260722",
                }),
              ),
            }),
          ),
      }).catch((thrown) => thrown);

      expect(redirect).toBeInstanceOf(Response);
      expect((redirect as Response).status).toBe(302);
      // El aviso viaja por flash session, no por `actionData`: la ruta redirige.
      expect((redirect as Response).headers.get("set-cookie")).toContain(
        "ee-flash",
      );

      const stored = await db
        .select()
        .from(comprobantes)
        .where(eq(comprobantes.choreographyId, seeded.choreographyId));
      expect(stored).toHaveLength(1);
    });

    test("la re-verificación recupera el comprobante sin salir del diálogo", async () => {
      const seeded = await seedChoreographyWithPaidInscription({
        academyName: "Academia Re-verificada",
        choreographyName: "Coreografía re-verificada",
        email: "academia.reverificada@example.com",
        paidAmount: 3000,
      });

      const billing = fakeBilling({
        getVoucherInfo: vi.fn(
          async (): Promise<VoucherInfoResultDto> => ({
            ...facturaCConsultada,
            cbteDesde: 43,
            cbteHasta: 43,
            impTotal: 3000,
            cbteFch: "20260722",
          }),
        ),
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

      // No cruza un redirect: llega como estado del alert, distinguible de la
      // recuperación durante el submit original.
      expect(result).toEqual({
        status: "contingency",
        contingency: { status: "recovered" },
      });
      expect(billing.createVoucher).not.toHaveBeenCalled();

      const stored = await db
        .select()
        .from(comprobantes)
        .where(eq(comprobantes.choreographyId, seeded.choreographyId));
      expect(stored).toHaveLength(1);
    });

    // El importe lo recalcula el server desde el facturable: un correlativo
    // adulterado no puede forzar la persistencia de un CAE ajeno (decisión 4).
    test("la re-verificación de un correlativo ajeno se queda sin verificar", async () => {
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
              getVoucherInfo: vi.fn(
                async (): Promise<VoucherInfoResultDto> => ({
                  ...facturaCConsultada,
                  cbteDesde: 999,
                  cbteHasta: 999,
                  impTotal: 999999,
                  cbteFch: "20260722",
                }),
              ),
            }),
          ),
      });

      expect(result).toMatchObject({
        status: "contingency",
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
  },
);

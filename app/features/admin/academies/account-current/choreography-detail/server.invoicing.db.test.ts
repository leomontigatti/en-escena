import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
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
  facturaCRechazada,
  ultimoAutorizado,
} from "@/lib/comprobantes/arca/fixtures";
import { recordComprobante } from "@/lib/comprobantes/comprobantes.server";
import type { FacturaCEmissionDeps } from "@/lib/comprobantes/emit-factura-c.server";

import { installDatabaseTestHooks } from "../../../../../../tests/db/harness";
import {
  createAccountCurrentChoreographyFixture,
  createSavedEvent,
  createSignedInRequest,
} from "../../../../../lib/admin/academies/account-current-route.test-support";

import {
  handleAdministrativeChoreographyFinanceAction,
  loadAdministrativeChoreographyFinanceDetail,
} from "./server";
import { emitComprobanteConfirmValue, emitComprobanteIntent } from "./shared";

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
    allocationType: "deposit",
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
  porcion?: "seña" | "saldo" | "total";
}) {
  return await recordComprobante({
    choreographyId: input.choreographyId,
    eventId: input.eventId,
    cbteTipo: FACTURA_C_CBTE_TIPO,
    ptoVta: 1,
    cbteNro: input.cbteNro,
    cbteFch: "20260722",
    porcion: input.porcion,
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

  const data = await loadAdministrativeChoreographyFinanceDetail({
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
    test("covers no portion when there is billed money and no comprobante", async () => {
      const seeded = await seedChoreographyWithPaidInscription({
        academyName: "Academia Sin Factura",
        choreographyName: "Coreografía sin factura",
        email: "academia.sin.factura@example.com",
        paidAmount: 3000,
      });

      const loaderData = await loadDetail(seeded);

      expect(loaderData.invoicing).toMatchObject({
        billableAmount: 3000,
        canEmit: true,
        sena: null,
        saldo: null,
      });
    });

    test("marks the seña portion Vigente once its factura covers the whole cobro", async () => {
      const seeded = await seedChoreographyWithPaidInscription({
        academyName: "Academia Vigente",
        choreographyName: "Coreografía vigente",
        email: "academia.vigente@example.com",
        paidAmount: 3000,
      });
      const factura = await recordVigenteFactura({
        choreographyId: seeded.choreographyId,
        eventId: seeded.eventId,
        inscriptionId: seeded.inscriptionId,
        amount: 3000,
        cbteNro: 7,
        porcion: "seña",
      });

      const loaderData = await loadDetail(seeded);

      expect(loaderData.invoicing).toMatchObject({
        billableAmount: 0,
        canEmit: false,
        sena: { comprobanteId: factura.id, currency: "vigente" },
        saldo: null,
      });
    });

    test("points both portions to a total factura that covers seña and saldo", async () => {
      const seeded = await seedChoreographyWithPaidInscription({
        academyName: "Academia Total",
        choreographyName: "Coreografía total",
        email: "academia.total@example.com",
        paidAmount: 3000,
      });
      const factura = await recordVigenteFactura({
        choreographyId: seeded.choreographyId,
        eventId: seeded.eventId,
        inscriptionId: seeded.inscriptionId,
        amount: 3000,
        cbteNro: 7,
        porcion: "total",
      });

      const loaderData = await loadDetail(seeded);

      expect(loaderData.invoicing.sena).toMatchObject({
        comprobanteId: factura.id,
      });
      expect(loaderData.invoicing.saldo).toMatchObject({
        comprobanteId: factura.id,
      });
    });

    test("marks the seña portion Desactualizada when new money is billed after it", async () => {
      const seeded = await seedChoreographyWithPaidInscription({
        academyName: "Academia Desactualizada",
        choreographyName: "Coreografía desactualizada",
        email: "academia.desactualizada@example.com",
        paidAmount: 3000,
      });
      await recordVigenteFactura({
        choreographyId: seeded.choreographyId,
        eventId: seeded.eventId,
        inscriptionId: seeded.inscriptionId,
        amount: 3000,
        cbteNro: 7,
        porcion: "seña",
      });
      await seedAllocation({
        academyId: seeded.academyId,
        amount: 2000,
        eventId: seeded.eventId,
        inscriptionId: seeded.inscriptionId,
      });

      const loaderData = await loadDetail(seeded);

      expect(loaderData.invoicing).toMatchObject({
        billableAmount: 2000,
        canEmit: true,
        sena: { currency: "desactualizada" },
      });
    });

    test("drops the portion coverage when the covering factura is annulled", async () => {
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
        porcion: "seña",
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

      // Anulada la única factura que cubría la seña, la porción deja de estar
      // cubierta: badge y botón desaparecen y su monto vuelve a ser facturable.
      expect(loaderData.invoicing.sena).toBeNull();
      expect(loaderData.invoicing.saldo).toBeNull();
      expect(loaderData.invoicing.canEmit).toBe(true);
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

      const redirect = await handleAdministrativeChoreographyFinanceAction({
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

      const result = await handleAdministrativeChoreographyFinanceAction({
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

      expect(result).toMatchObject({ status: "emission-error" });
      if (result.status === "emission-error") {
        expect(result.contingency.resultado).toBe("R");
        expect(result.contingency.errors.length).toBeGreaterThan(0);
      }

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

      const result = await handleAdministrativeChoreographyFinanceAction({
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

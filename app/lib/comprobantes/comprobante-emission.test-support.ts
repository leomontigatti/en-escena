import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { vi } from "vitest";

import { db } from "@/db";
import { paymentAllocations, payments } from "@/db/schema";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import {
  ArcaClient,
  type ArcaBillingPort,
  type ArcaTimeouts,
} from "@/lib/comprobantes/arca/client.server";
import {
  facturaCAprobada,
  ultimoAutorizado,
} from "@/lib/comprobantes/arca/wsfe-responses.test-support";
import type { RecordComprobanteInput } from "@/lib/comprobantes/comprobantes.server";
import type { FacturaCEmissionDeps } from "@/lib/comprobantes/emit-factura-c.server";

/**
 * ARCA approving a `Factura C` that follows `ultimoAutorizado`. The lookup is
 * only asked when the authorization falls over, and by default ARCA does not
 * have that comprobante.
 */
export function fakeBilling(
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

// Emission deps with a mocked ARCA client (zero network) and a fixed `cbteFch`,
// so as not to depend on the clock.
export function emissionDeps(
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

// Timeouts in milliseconds, to exercise the real cut-off without fake timers.
export const FAST_TIMEOUTS: ArcaTimeouts = { lookup: 20, authorization: 20 };

export function neverAnswers(): Promise<never> {
  return new Promise<never>(() => {});
}

// ARCA dropped the connection: the SDK declares no error classes or codes, so a
// transport failure arrives as an ordinary `Error`.
export function connectionLost(): Promise<never> {
  return Promise.reject(new Error("socket hang up"));
}

let paymentNumber = 0;

// Records an actual collection: a `Pago` and its `Asignación de pago` on the
// inscription. It is the financial source of truth the invoice derives from.
export async function allocatePayment(input: {
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
    choreographyInscriptionId: input.inscriptionId,
    academyId: input.academyId,
    eventId: input.eventId,
    amount: input.amount,
  });
}

// Snapshot of a `Factura C` to an anonymous final consumer issued by the exempt
// issuer (the values replicate the real circuit of spike #428).
export function facturaCInput(
  overrides: Partial<RecordComprobanteInput> & {
    choreographyId: string;
    eventId: string;
  },
): RecordComprobanteInput {
  const { choreographyId, ...rest } = overrides;

  return {
    anchor: choreographyAnchor(choreographyId),
    cbteTipo: 11,
    ptoVta: 1,
    cbteNro: 1,
    cbteFch: "20260722",
    impTotal: 10000,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "75123456789012",
    caeVto: "20260801",
    lines: [],
    ...rest,
  };
}

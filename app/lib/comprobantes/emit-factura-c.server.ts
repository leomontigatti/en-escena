import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  events,
  paymentAllocations,
} from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import { ArcaClient, getArcaClient } from "./arca/client.server";
import type { ArcaAttemptedVoucher } from "./arca/contingency.server";
import {
  emitWithContingency,
  recheckWithContingency,
  toArcaDate,
  type ArcaEmissionChoreography,
  type ArcaEmissionOutcome,
} from "./arca/emission.server";
import {
  DOC_NRO_CONSUMIDOR_FINAL,
  DOC_TIPO_CONSUMIDOR_FINAL,
  FACTURA_C_CBTE_TIPO,
} from "./arca/factura-c";
import type { ServiceDates } from "./arca/factura-c";
import type { ArcaMessage } from "./arca/responses";
import {
  listChoreographyComprobantes,
  recordComprobante,
  type ComprobanteLineInput,
} from "./comprobantes.server";

type ComprobanteRow = Awaited<ReturnType<typeof recordComprobante>>;

// The issuer is `Proyecciones Artísticas Asociación Civil`, EXEMPT from VAT
// (#426): it always issues class C. The snapshot enum admits only this value.
export const ISSUER_IVA_CONDITION = "exento" as const;

// Injectable emission inputs: the ARCA client (mockable in tests) and the sales
// point and recipient config. `cbteFch` is optional; it defaults to Córdoba's
// business date in ARCA format.
export type FacturaCEmissionDeps = {
  client: ArcaClient;
  ptoVta: number;
  issuerCuit: string;
  // The final consumer recipient's VAT condition, resolved against ARCA (#324).
  receptorIvaConditionId: number;
  cbteFch?: string;
};

export type FacturaCEmissionInput = {
  choreographyId: string;
  eventId: string;
};

export type FacturaCEmissionFailureReason =
  | "not-found"
  | "nothing-to-bill"
  // ARCA responded and did not authorize.
  | "rejected"
  // ARCA did not respond and it was established that nothing was emitted:
  // retrying is safe (ADR-0012 decision 6).
  | "not-emitted"
  // ARCA did not respond and the follow-up lookup did not resolve what happened.
  | "unverified";

export type FacturaCEmissionOutcome =
  | {
      ok: true;
      comprobante: ComprobanteRow;
      // The CAE was recovered by querying ARCA after an authorization with no
      // response, instead of coming from `FECAESolicitar` (#577).
      recovered: boolean;
    }
  | {
      ok: false;
      reason: FacturaCEmissionFailureReason;
      message: string;
      // Present only on a rejection from ARCA.
      arca?: {
        resultado: string | null;
        errors: ArcaMessage[];
        observaciones: ArcaMessage[];
      };
      // Present only on `unverified`: the comprobante that could not be resolved.
      attempt?: ArcaAttemptedVoucher;
    };

/**
 * Emits a `Factura C` (`CbteTipo` 11) for a choreography against WSFEv1.
 *
 * The invoice is a DERIVED document (#320): it never governs financial state.
 * What is billed is the money actually collected (payment allocations) that no
 * vigente type-11 invoice of the choreography covers yet, through the
 * per-inscription anti-double-billing derivation (#323/#326).
 *
 * The `CbteNro` is derived from `FECompUltimoAutorizado + 1`. Only an approved
 * CAE persists the `Comprobante` with its snapshot; a rejection from ARCA
 * persists nothing and touches no payment, allocation or inscription.
 *
 * When ARCA does not answer, the failure is classified by phase (ADR-0012). If
 * the correlative query was cut, nothing was authorized. If the authorization
 * was cut, ARCA is queried for the exact comprobante that was attempted: when it
 * comes back and matches what was sent, it HAD been authorized and is persisted
 * with that CAE — the one exception to the invariant that a contingency persists
 * nothing, and it exists because the row corresponds to a fiscal document
 * demonstrably held by ARCA; when it does not come back and the authorization
 * had failed in transport, nothing was emitted. When the query fails, returns a
 * different comprobante, or does not find it but the authorization timed out —
 * so it is still in flight and may be authorized later — the result is
 * `unverified` and nothing is persisted.
 */
export async function emitChoreographyFacturaC(
  input: FacturaCEmissionInput,
  deps: FacturaCEmissionDeps,
): Promise<FacturaCEmissionOutcome> {
  const resolved = await resolveFacturaCChoreography(input, deps);

  if (!resolved.ok) {
    return resolved;
  }

  const emission = await emitWithContingency(resolved.choreography);

  return toFacturaCOutcome(emission);
}

/**
 * Re-verifies against ARCA an emission left unresolved (#577), for the sequence
 * number the dialog carries over from the previous attempt. It re-derives the
 * choreography's billable — which is where the amount the queried comprobante is
 * validated against comes from — so if somebody touched the allocations in the
 * meantime, the amount does not match and the result stays `unverified`.
 */
export async function recheckChoreographyFacturaC(
  input: FacturaCEmissionInput & { cbteNro: number },
  deps: FacturaCEmissionDeps,
): Promise<FacturaCEmissionOutcome> {
  const resolved = await resolveFacturaCChoreography(input, deps);

  if (!resolved.ok) {
    return resolved;
  }

  const emission = await recheckWithContingency(
    resolved.choreography,
    input.cbteNro,
  );

  return toFacturaCOutcome(emission);
}

function toFacturaCOutcome(
  emission: ArcaEmissionOutcome<ComprobanteRow>,
): FacturaCEmissionOutcome {
  return emission.ok
    ? {
        ok: true,
        comprobante: emission.voucher,
        recovered: emission.recovered,
      }
    : emission;
}

/**
 * Assembles the `Factura C` emission choreography: it validates the anchor,
 * derives the billable and freezes the service dates. Emission and
 * re-verification share it, since re-verification needs exactly the same inputs
 * — the amount and the date a recovered comprobante is validated against
 * (ADR-0012 decision 4) — computed on the server rather than taken from the
 * form.
 */
async function resolveFacturaCChoreography(
  input: FacturaCEmissionInput,
  deps: FacturaCEmissionDeps,
): Promise<
  | { ok: true; choreography: ArcaEmissionChoreography<ComprobanteRow> }
  | Extract<FacturaCEmissionOutcome, { ok: false }>
> {
  const [choreography] = await db
    .select({
      id: choreographies.id,
      eventId: choreographies.eventId,
      eventStartsAt: events.startsAt,
      eventEndsAt: events.endsAt,
    })
    .from(choreographies)
    .innerJoin(events, eq(events.id, choreographies.eventId))
    .where(eq(choreographies.id, input.choreographyId));

  if (!choreography || choreography.eventId !== input.eventId) {
    return {
      ok: false,
      reason: "not-found",
      message: choreographyNotFoundMessage,
    };
  }

  const { lines, total } = await resolveChoreographyBillable(
    input.choreographyId,
  );

  if (total <= 0) {
    return {
      ok: false,
      reason: "nothing-to-bill",
      message:
        "No hay un monto cobrado pendiente de facturar en esta coreografía.",
    };
  }

  // Service dates (Concepto 2, ADR-0011): the period is the event's, and the
  // payment due date is the comprobante's own date, because what is billed was
  // already collected and so nothing falls due in the future. Frozen at
  // emission.
  const serviceDates = (cbteFch: string): ServiceDates => ({
    fchServDesde: toArcaDate(getBusinessDateOnly(choreography.eventStartsAt)),
    fchServHasta: toArcaDate(getBusinessDateOnly(choreography.eventEndsAt)),
    fchVtoPago: cbteFch,
  });

  const choreographyCall: ArcaEmissionChoreography<ComprobanteRow> = {
    client: deps.client,
    subject: "comprobante",
    ptoVta: deps.ptoVta,
    cbteTipo: FACTURA_C_CBTE_TIPO,
    cbteFch: deps.cbteFch,
    impTotal: total,
    getLastNumber: () => deps.client.getLastFacturaCNumber(deps.ptoVta),
    emit: (request) =>
      deps.client.emitFacturaC({
        ptoVta: deps.ptoVta,
        cbteNro: request.cbteNro,
        cbteFch: request.cbteFch,
        importe: total,
        condicionIvaReceptorId: deps.receptorIvaConditionId,
        ...serviceDates(request.cbteFch),
      }),
    persist: (authorized, request): Promise<ComprobanteRow> =>
      recordComprobante({
        choreographyId: input.choreographyId,
        eventId: input.eventId,
        cbteTipo: FACTURA_C_CBTE_TIPO,
        ptoVta: deps.ptoVta,
        cbteNro: authorized.cbteNro,
        cbteFch: authorized.cbteFch,
        // Service dates DERIVED and FROZEN: reallocating a payment after
        // emission does not alter what this comprobante says (ADR-0011, #479).
        ...serviceDates(request.cbteFch),
        impTotal: total,
        issuerCuit: deps.issuerCuit,
        issuerIvaCondition: ISSUER_IVA_CONDITION,
        receptorDocTipo: DOC_TIPO_CONSUMIDOR_FINAL,
        receptorDocNro: String(DOC_NRO_CONSUMIDOR_FINAL),
        receptorIvaConditionId: deps.receptorIvaConditionId,
        cae: authorized.cae,
        caeVto: authorized.caeVto,
        lines,
      }),
  };

  return { ok: true, choreography: choreographyCall };
}

export type ChoreographyBillable = {
  lines: ComprobanteLineInput[];
  total: number;
};

/**
 * Billable amount of a choreography: its internal lines, one per inscription
 * with a positive remainder, plus the total. It is what the emission UX (#447)
 * previews before confirming and what `emitChoreographyFacturaC` bills. It does
 * not call ARCA: it only crosses collections against vigente invoices.
 */
export async function resolveChoreographyBillable(
  choreographyId: string,
): Promise<ChoreographyBillable> {
  const inscriptionIds = await readInscriptionIds(choreographyId);
  const lines = await resolveBillableLines(choreographyId, inscriptionIds);
  const total = lines.reduce((sum, line) => sum + line.amount, 0);

  return { lines, total };
}

/** The ids of every inscription of the choreography, withdrawn ones included. */
async function readInscriptionIds(choreographyId: string): Promise<string[]> {
  const rows = await db
    .select({ id: choreographyDancers.id })
    .from(choreographyDancers)
    .where(eq(choreographyDancers.choreographyId, choreographyId));

  return rows.map((row) => row.id);
}

/**
 * Billable amount of each inscription: what was collected (payment allocations)
 * minus what the choreography's VIGENTE type-11 invoices already cover. Only
 * inscriptions with a positive remainder are included. An annulled invoice stops
 * counting as billed — its status derives from the credit note — so its
 * amount becomes billable again.
 */
async function resolveBillableLines(
  choreographyId: string,
  inscriptionIds: string[],
): Promise<ComprobanteLineInput[]> {
  if (inscriptionIds.length === 0) {
    return [];
  }

  const allocations = await db
    .select({
      inscriptionId: paymentAllocations.inscriptionId,
      amount: paymentAllocations.amount,
    })
    .from(paymentAllocations)
    .where(inArray(paymentAllocations.inscriptionId, inscriptionIds));

  const paidByInscription = sumByInscription(allocations);
  const existing = await listChoreographyComprobantes(choreographyId);
  const billedByInscription = new Map<string, number>();
  for (const comprobante of existing) {
    if (
      comprobante.cbteTipo !== FACTURA_C_CBTE_TIPO ||
      comprobante.status !== "vigente"
    ) {
      continue;
    }
    for (const line of comprobante.lines) {
      if (line.inscriptionId === null) {
        continue;
      }
      billedByInscription.set(
        line.inscriptionId,
        (billedByInscription.get(line.inscriptionId) ?? 0) + line.amount,
      );
    }
  }

  const lines: ComprobanteLineInput[] = [];
  for (const inscriptionId of inscriptionIds) {
    const paid = paidByInscription.get(inscriptionId) ?? 0;
    const billable = paid - (billedByInscription.get(inscriptionId) ?? 0);
    if (billable > 0) {
      lines.push({ inscriptionId, amount: billable });
    }
  }

  return lines;
}

function sumByInscription(
  allocations: Array<{ inscriptionId: string; amount: number }>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const allocation of allocations) {
    totals.set(
      allocation.inscriptionId,
      (totals.get(allocation.inscriptionId) ?? 0) + allocation.amount,
    );
  }
  return totals;
}

/**
 * Resolves the production emission inputs from the environment: the shared ARCA
 * client (with its TA cache) plus the sales point and the recipient's VAT
 * condition. The emission UX (#447) consumes this; the tests inject a mocked
 * client and do not come through here.
 */
export function getFacturaCEmissionDeps(
  env: NodeJS.ProcessEnv = process.env,
): FacturaCEmissionDeps {
  return {
    client: getArcaClient(env),
    ...readFacturaCEmissionConfig(env),
  };
}

export function readFacturaCEmissionConfig(
  env: NodeJS.ProcessEnv = process.env,
): Pick<
  FacturaCEmissionDeps,
  "ptoVta" | "issuerCuit" | "receptorIvaConditionId"
> {
  return {
    ptoVta: requirePositiveIntEnv(env, "ARCA_PTOVTA"),
    issuerCuit: requireEnv(env, "ARCA_CUIT"),
    receptorIvaConditionId: requirePositiveIntEnv(
      env,
      "ARCA_CONDICION_IVA_RECEPTOR_ID",
    ),
  };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable ${name}.`);
  }
  return value;
}

function requirePositiveIntEnv(env: NodeJS.ProcessEnv, name: string): number {
  const raw = requireEnv(env, name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name}="${raw}" no es un entero positivo.`);
  }
  return value;
}

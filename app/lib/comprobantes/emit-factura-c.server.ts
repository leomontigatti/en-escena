import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { restrictedChoreographyInscriptionId } from "@/lib/finances/allocation-target.server";
import {
  choreographies,
  dancers,
  events,
  paymentAllocations,
  professors,
  choreographyDancers,
  seminarInscriptions,
  seminars,
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
import type { ComprobanteAnchor } from "./anchor";
import {
  listAnchorComprobantes,
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

// The unit being billed and the event it belongs to. The anchor decides
// everything that differs between the two kinds; the event is checked against
// the anchor's own so a form cannot bill one event's unit under another's.
export type FacturaCEmissionInput = {
  anchor: ComprobanteAnchor;
  eventId: string;
};

const seminarNotFoundMessage = "No encontramos ese seminario.";

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
 * Emits a `Factura C` (`CbteTipo` 11) for one anchor against WSFEv1 — a
 * choreography, or what one academy holds in one seminar.
 *
 * The invoice is a DERIVED document (#320): it never governs financial state.
 * What is billed is the money actually collected (payment allocations) that no
 * vigente type-11 invoice of the SAME ANCHOR covers yet, through the
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
export async function emitFacturaC(
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
 * anchor's billable — which is where the amount the queried comprobante is
 * validated against comes from — so if somebody touched the allocations in the
 * meantime, the amount does not match and the result stays `unverified`.
 */
export async function recheckFacturaC(
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
  const anchorContext = await resolveAnchorContext(input);

  if (!anchorContext.ok) {
    return anchorContext;
  }

  const { lines, total } = await resolveAnchorBillable(input.anchor);

  if (total <= 0) {
    return {
      ok: false,
      reason: "nothing-to-bill",
      message: anchorContext.nothingToBillMessage,
    };
  }

  // Service dates (Concepto 2, ADR-0011): the period is the unit's own — the
  // event's for a choreography, the seminar's single date for a seminar — and
  // the payment due date is the comprobante's own date, because what is billed
  // was already collected and so nothing falls due in the future. Frozen at
  // emission.
  const serviceDates = (cbteFch: string): ServiceDates => ({
    fchServDesde: anchorContext.serviceFrom,
    fchServHasta: anchorContext.serviceTo,
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
        anchor: input.anchor,
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

type AnchorContext = {
  ok: true;
  // ARCA-formatted service period, already frozen: both ends are the seminar's
  // own date for a seminar unit, and the event's span for a choreography.
  serviceFrom: string;
  serviceTo: string;
  nothingToBillMessage: string;
};

/**
 * Validates that the anchor exists inside the named event and answers what the
 * emission needs from it. It is the one place the two kinds are told apart on
 * the way in; everything past it reads the same shape.
 */
async function resolveAnchorContext(
  input: FacturaCEmissionInput,
): Promise<AnchorContext | Extract<FacturaCEmissionOutcome, { ok: false }>> {
  if (input.anchor.kind === "choreography") {
    const [choreography] = await db
      .select({
        eventId: choreographies.eventId,
        eventStartsAt: events.startsAt,
        eventEndsAt: events.endsAt,
      })
      .from(choreographies)
      .innerJoin(events, eq(events.id, choreographies.eventId))
      .where(eq(choreographies.id, input.anchor.choreographyId));

    if (!choreography || choreography.eventId !== input.eventId) {
      return {
        ok: false,
        reason: "not-found",
        message: choreographyNotFoundMessage,
      };
    }

    return {
      ok: true,
      serviceFrom: toArcaDate(getBusinessDateOnly(choreography.eventStartsAt)),
      serviceTo: toArcaDate(getBusinessDateOnly(choreography.eventEndsAt)),
      nothingToBillMessage:
        "No hay un monto cobrado pendiente de facturar en esta coreografía.",
    };
  }

  const [seminar] = await db
    .select({
      eventId: seminars.eventId,
      scheduledDate: seminars.scheduledDate,
    })
    .from(seminars)
    .where(eq(seminars.id, input.anchor.seminarId));

  if (!seminar || seminar.eventId !== input.eventId) {
    return { ok: false, reason: "not-found", message: seminarNotFoundMessage };
  }

  // A seminar is taught on one day, so the service period collapses to it: both
  // ends read the same date rather than borrowing the event's span, which would
  // claim a period nothing was sold for.
  const seminarDate = toArcaDate(seminar.scheduledDate);

  return {
    ok: true,
    serviceFrom: seminarDate,
    serviceTo: seminarDate,
    nothingToBillMessage:
      "No hay un monto cobrado pendiente de facturar en este seminario.",
  };
}

export type AnchorBillable = {
  lines: ComprobanteLineInput[];
  total: number;
};

/**
 * Billable amount of one anchor: its internal lines, one per inscription with a
 * positive remainder, plus the total. It is what the emission UX (#447) previews
 * before confirming and what `emitFacturaC` bills. It does not call ARCA: it
 * only crosses collections against vigente invoices of the same anchor.
 */
export async function resolveAnchorBillable(
  anchor: ComprobanteAnchor,
): Promise<AnchorBillable> {
  const inscriptionIds = await readAnchorInscriptionIds(anchor);
  const lines = await resolveBillableLines(anchor, inscriptionIds);
  const total = lines.reduce((sum, line) => sum + line.amount, 0);

  return { lines, total };
}

/**
 * The ids of every inscription the anchor bills, **withdrawn ones included**: a
 * withdrawal keeps its money, and the comprobante is the evidence of what was
 * retained.
 *
 * For a seminar the unit is the pair, so the academy is read through the person
 * the inscription names — whichever of the two roster tables is filled — which
 * is the same rule the `(seminar, academy)` financial detail lists by.
 */
async function readAnchorInscriptionIds(
  anchor: ComprobanteAnchor,
): Promise<string[]> {
  if (anchor.kind === "choreography") {
    const rows = await db
      .select({ id: choreographyDancers.id })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, anchor.choreographyId));

    return rows.map((row) => row.id);
  }

  const academyId = sql<string>`coalesce(${dancers.academyId}, ${professors.academyId})`;
  const rows = await db
    .select({ id: seminarInscriptions.id })
    .from(seminarInscriptions)
    .leftJoin(dancers, eq(dancers.id, seminarInscriptions.dancerId))
    .leftJoin(professors, eq(professors.id, seminarInscriptions.professorId))
    .where(
      and(
        eq(seminarInscriptions.seminarId, anchor.seminarId),
        eq(academyId, anchor.academyId),
      ),
    );

  return rows.map((row) => row.id);
}

/**
 * Billable amount of each inscription: what was collected (payment allocations)
 * minus what the anchor's VIGENTE type-11 invoices already cover. Only
 * inscriptions with a positive remainder are included. An annulled invoice stops
 * counting as billed — its status derives from the credit note — so its
 * amount becomes billable again.
 */
async function resolveBillableLines(
  anchor: ComprobanteAnchor,
  inscriptionIds: string[],
): Promise<ComprobanteLineInput[]> {
  if (inscriptionIds.length === 0) {
    return [];
  }

  const paidByInscription = await sumAllocationsByInscription(
    anchor,
    inscriptionIds,
  );
  const billedByInscription = await sumBilledByInscription(anchor);

  return inscriptionIds.flatMap((inscriptionId) => {
    const paid = paidByInscription.get(inscriptionId) ?? 0;
    const billable = paid - (billedByInscription.get(inscriptionId) ?? 0);

    return billable > 0 ? [buildLine(anchor, inscriptionId, billable)] : [];
  });
}

function buildLine(
  anchor: ComprobanteAnchor,
  inscriptionId: string,
  amount: number,
): ComprobanteLineInput {
  return anchor.kind === "choreography"
    ? { choreographyInscriptionId: inscriptionId, amount }
    : { seminarInscriptionId: inscriptionId, amount };
}

/**
 * What each inscription has collected. The allocation's target column is chosen
 * by the anchor's kind, which is the only thing that differs: the summing itself
 * is one rule for both.
 */
async function sumAllocationsByInscription(
  anchor: ComprobanteAnchor,
  inscriptionIds: string[],
): Promise<Map<string, number>> {
  const targetColumn =
    anchor.kind === "choreography"
      ? restrictedChoreographyInscriptionId
      : paymentAllocations.seminarInscriptionId;
  const rows = await db
    .select({
      inscriptionId: targetColumn,
      amount: paymentAllocations.amount,
    })
    .from(paymentAllocations)
    .where(
      anchor.kind === "choreography"
        ? inArray(paymentAllocations.choreographyInscriptionId, inscriptionIds)
        : inArray(paymentAllocations.seminarInscriptionId, inscriptionIds),
    );

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.inscriptionId === null) {
      continue;
    }
    totals.set(
      row.inscriptionId,
      (totals.get(row.inscriptionId) ?? 0) + row.amount,
    );
  }

  return totals;
}

/**
 * What the anchor's invoices in force already cover, per inscription. An
 * orphaned line — both target columns null — is skipped: it names nobody, so it
 * can neither be re-billed nor subtracted from anyone.
 */
async function sumBilledByInscription(
  anchor: ComprobanteAnchor,
): Promise<Map<string, number>> {
  const existing = await listAnchorComprobantes(anchor);
  const billed = new Map<string, number>();

  for (const comprobante of existing) {
    if (
      comprobante.cbteTipo !== FACTURA_C_CBTE_TIPO ||
      comprobante.status !== "vigente"
    ) {
      continue;
    }
    for (const line of comprobante.lines) {
      const inscriptionId =
        anchor.kind === "choreography"
          ? line.choreographyInscriptionId
          : line.seminarInscriptionId;

      if (inscriptionId === null) {
        continue;
      }
      billed.set(inscriptionId, (billed.get(inscriptionId) ?? 0) + line.amount);
    }
  }

  return billed;
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
    throw new Error(`${name}="${raw}" is not a positive integer.`);
  }
  return value;
}

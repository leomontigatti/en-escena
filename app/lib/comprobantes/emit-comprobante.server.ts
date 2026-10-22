import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, events, seminars } from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { deriveRetainedAmount } from "@/lib/finances/inscription-financial-status";
import { readChoreographyUnitFinance } from "@/lib/finances/operational-summary.server";
import { readSeminarUnitFinance } from "@/lib/finances/seminar-operational-summary.server";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import type { ArcaClient } from "./arca/client.server";
import {
  emitWithContingency,
  toArcaDate,
  type ArcaEmissionFailureReason,
  type ArcaEmissionOutcome,
  type ArcaEmissionRequest,
} from "./arca/emission.server";
import {
  DOC_NRO_CONSUMIDOR_FINAL,
  DOC_TIPO_CONSUMIDOR_FINAL,
  type ClassCVoucherBase,
} from "./arca/factura-c";
import type { ArcaMessage, FacturaCEmissionResult } from "./arca/responses";
import type { ComprobanteAnchor } from "./anchor";
import {
  withComprobanteAnchorLock,
  type ComprobanteExecutor,
} from "./anchor-lock.server";
import {
  checkCbteFch,
  deriveCbteFchBounds,
  type CbteFchBounds,
} from "./cbte-fch";
import {
  listAnchorComprobantes,
  recordComprobante,
  type ComprobanteLineInput,
  type ComprobanteWithLines,
} from "./comprobantes.server";
import {
  emissionRefusalLabel,
  planAnchorEmission,
  type DocumentedComprobante,
  type EmissionPlan,
  type EmissionRefusal,
  type OwedInscription,
  type PlannedLine,
} from "./emission-plan";
import { comprobanteKindCbteTipo, type KnownComprobanteKind } from "./kind";
import {
  blockedBy,
  findBlockingReservation,
  markReservationNumberTaken,
  readLastAuthorizedCbteFch,
  recordReservedComprobante,
  releaseReservation,
  reserveCorrelative,
  subjectOf,
  type ComprobanteReservation,
} from "./reservation.server";

type ComprobanteRow = Awaited<ReturnType<typeof recordComprobante>>;

// The issuer is `Proyecciones Artísticas Asociación Civil`, EXEMPT from VAT
// (#426): it always issues class C. The snapshot enum admits only this value.
const ISSUER_IVA_CONDITION = "exento" as const;

// Injectable emission inputs: the ARCA client (mockable in tests) and the sales
// point and recipient config. `today` is the business date, `AAAA-MM-DD`; it
// defaults to Córdoba's, and the tests pin it.
export type ComprobanteEmissionDeps = {
  client: ArcaClient;
  ptoVta: number;
  issuerCuit: string;
  // The final consumer recipient's VAT condition, resolved against ARCA (#324).
  receptorIvaConditionId: number;
  today?: string;
};

// The unit being billed and the event it belongs to. The anchor decides
// everything that differs between the two kinds; the event is checked against
// the anchor's own so a form cannot bill one event's unit under another's.
export type ComprobanteEmissionInput = {
  anchor: ComprobanteAnchor;
  eventId: string;
};

// The document the operator saw and confirmed. The plan made under the lock
// must still be it: the kind can flip between the preview and the click, and
// what ARCA authorizes cannot be taken back.
export type ConfirmedEmission = {
  kind: KnownComprobanteKind;
  amount: number;
};

const seminarNotFoundMessage = "No encontramos ese seminario.";

export type ComprobanteEmissionFailureReason =
  | "not-found"
  // The plan refuses; `refusals` says why, every reason that applies.
  | "refused"
  // The plan under the lock is no longer the document the operator confirmed.
  | "changed"
  // The chosen `CbteFch` falls outside what ARCA accepts in its series.
  | "invalid-date"
  | ArcaEmissionFailureReason;

export type ComprobanteEmissionOutcome =
  | {
      ok: true;
      comprobante: ComprobanteRow;
      // The CAE was recovered by querying ARCA after an authorization with no
      // response, instead of coming from `FECAESolicitar` (#577).
      recovered: boolean;
    }
  | {
      ok: false;
      reason: ComprobanteEmissionFailureReason;
      message: string;
      // Present only on `refused`.
      refusals?: EmissionRefusal[];
      // Present only on a rejection from ARCA.
      arca?: {
        resultado: string | null;
        errors: ArcaMessage[];
        observaciones: ArcaMessage[];
      };
      // Present on `unverified` and `number-taken`: the reservation left live.
      attempt?: { ptoVta: number; cbteTipo: number; cbteNro: number };
    };

type EmissionFailure = Extract<ComprobanteEmissionOutcome, { ok: false }>;

/**
 * Emits whatever document one anchor owes (ADR-0014 §5) — a choreography, or
 * what one academy holds in one seminar — against WSFEv1.
 *
 * The comprobante is the document of an obligation, not a receipt: what is
 * billed is the unit's derived total against what its comprobantes already
 * document, `planAnchorEmission`'s delta. The first document is the `Factura C`
 * for the full price, once the unit is `Señada` and its total is positive;
 * after it a positive delta is a `Nota de débito C` and a negative one a
 * `Nota de crédito C`, both anchored at the invoice. Refunds never enter it.
 *
 * The plan is computed under the anchor's lock and before ARCA is called, so
 * the crediting ceiling it enforces is checked against the documents as they
 * stand when the note goes out. Nothing else enforces it: #686 saw ARCA
 * authorize a credit note larger than its invoice.
 *
 * Two races, two mechanisms (ADR-0014 §7). The anchor's lock closes the delta
 * race. The correlative race is per series and closed by the reservation:
 * the number is `FECompUltimoAutorizado + 1` in the document's own series and
 * is committed as a reservation before `FECAESolicitar`, so the lock is a
 * session one and no transaction stays open across ARCA. A live reservation
 * blocks its series, and one of the same anchor blocks it in every series,
 * since its document may exist without the plan knowing.
 *
 * `cbteFch` is the operator's, `AAAA-MM-DD`, today when absent, and is refused
 * before ARCA below its series' floor or after today (`cbte-fch.ts`).
 */
export async function emitAnchorComprobante(
  input: ComprobanteEmissionInput & {
    confirmed?: ConfirmedEmission;
    cbteFch?: string;
  },
  deps: ComprobanteEmissionDeps,
): Promise<ComprobanteEmissionOutcome> {
  return await withComprobanteAnchorLock(input.anchor, async () => {
    const planned = await planConfirmedEmission(input);

    if (!planned.ok) {
      return planned;
    }

    const cleared = await clearSeriesAndDate(input, deps, planned.plan);

    if (!cleared.ok) {
      return cleared;
    }

    return toOutcome(
      await emitWithContingency(
        emissionChoreography({
          input,
          deps,
          context: planned.context,
          plan: planned.plan,
          cbteFch: toArcaDate(cleared.cbteFch),
        }),
      ),
    );
  });
}

// What the anchor owes under the lock, refused when it owes nothing or no
// longer what the operator confirmed.
async function planConfirmedEmission(
  input: ComprobanteEmissionInput & { confirmed?: ConfirmedEmission },
): Promise<
  | {
      ok: true;
      context: AnchorContext;
      plan: Extract<EmissionPlan<DocumentedRow>, { ok: true }>;
    }
  | EmissionFailure
> {
  const context = await resolveAnchorContext(input, db);

  if (!context.ok) {
    return context;
  }

  const plan = planAnchorEmission(
    await readAnchorObligation(input, context, db),
  );

  if (!plan.ok) {
    return refusal(plan.reasons);
  }

  if (
    input.confirmed &&
    (input.confirmed.kind !== plan.kind ||
      input.confirmed.amount !== plan.amount)
  ) {
    return {
      ok: false,
      reason: "changed",
      message:
        "Lo que se debe cambió desde que abriste el diálogo. Cerralo y volvé a emitir.",
    };
  }

  return { ok: true, context, plan };
}

// The two refusals that come before ARCA once the document is known: a live
// reservation holding its series or its anchor, and a date the series cannot
// take. Answers the date to emit with otherwise.
async function clearSeriesAndDate(
  input: ComprobanteEmissionInput & { cbteFch?: string },
  deps: ComprobanteEmissionDeps,
  plan: Extract<EmissionPlan<DocumentedRow>, { ok: true }>,
): Promise<{ ok: true; cbteFch: string } | EmissionFailure> {
  const series = {
    ptoVta: deps.ptoVta,
    cbteTipo: comprobanteKindCbteTipo(plan.kind),
  };
  const blocking = await findBlockingReservation({
    ...series,
    anchor: input.anchor,
  });

  if (blocking) {
    return await blockedBy(blocking);
  }

  const today = deps.today ?? getBusinessDateOnly();
  const cbteFch = input.cbteFch ?? today;
  const dateRefusal = checkCbteFch(
    cbteFch,
    await readCbteFchBounds(series, today),
  );

  return dateRefusal
    ? { ok: false, reason: "invalid-date", message: dateRefusal }
    : { ok: true, cbteFch };
}

/**
 * What the anchor owes right now, for the financial detail to preview and to
 * explain a refusal with, and the dates its document may carry. It reads
 * outside the lock: the emission plans again under it and refuses a plan that
 * is no longer the confirmed one, so a preview gone stale costs a refusal,
 * never a document.
 */
export async function readAnchorEmissionPlan(
  input: ComprobanteEmissionInput & { ptoVta: number | null },
): Promise<
  | (Extract<EmissionPlan<DocumentedRow>, { ok: true }> & {
      cbteFch: CbteFchBounds & { today: string };
    })
  | Extract<EmissionPlan<DocumentedRow>, { ok: false }>
  | EmissionFailure
> {
  const context = await resolveAnchorContext(input, db);

  if (!context.ok) {
    return context;
  }

  const plan = planAnchorEmission(
    await readAnchorObligation(input, context, db),
  );

  if (!plan.ok) {
    return plan;
  }

  const today = getBusinessDateOnly();
  const bounds = await readCbteFchBounds(
    { ptoVta: input.ptoVta, cbteTipo: comprobanteKindCbteTipo(plan.kind) },
    today,
  );

  return { ...plan, cbteFch: { ...bounds, today } };
}

async function readCbteFchBounds(
  series: { ptoVta: number | null; cbteTipo: number },
  today: string,
): Promise<CbteFchBounds> {
  return deriveCbteFchBounds({
    // Without a configured sales point the floor is shown for the kind's
    // series at every point, which is only ever stricter.
    series: { ptoVta: series.ptoVta ?? 1, cbteTipo: series.cbteTipo },
    today,
    lastAuthorizedCbteFch: await readLastAuthorizedCbteFch(series),
  });
}

export function toOutcome(
  emission: ArcaEmissionOutcome<ComprobanteRow>,
): ComprobanteEmissionOutcome {
  return emission.ok
    ? {
        ok: true,
        comprobante: emission.voucher,
        recovered: emission.recovered,
      }
    : emission;
}

function refusal(reasons: EmissionRefusal[]): EmissionFailure {
  return {
    ok: false,
    reason: "refused",
    refusals: reasons,
    message: reasons.map(emissionRefusalLabel).join(" "),
  };
}

/**
 * The ARCA side of the document the plan names, and the reservation it goes
 * out under. The reservation carries the comprobante's whole snapshot, so a
 * re-check that finds it authorized later records exactly what was submitted.
 */
function emissionChoreography(input: {
  input: ComprobanteEmissionInput;
  deps: ComprobanteEmissionDeps;
  context: AnchorContext;
  plan: Extract<EmissionPlan<DocumentedRow>, { ok: true }>;
  cbteFch: string;
}) {
  const { context, deps, plan } = input;
  const cbteTipo = comprobanteKindCbteTipo(plan.kind);
  // The note mirrors the invoice's service period, which is the unit's and
  // stable across its documents; the invoice takes the unit's own.
  const factura = plan.kind === "factura_c" ? null : plan.factura;
  const serviceDates = {
    fchServDesde: factura?.fchServDesde ?? context.serviceFrom,
    fchServHasta: factura?.fchServHasta ?? context.serviceTo,
    // Each comprobante's own date (ADR-0014 §8): WSFEv1 wants it no earlier
    // than `CbteFch`, so a note cannot copy the invoice's.
    fchVtoPago: input.cbteFch,
  };
  const series = { ptoVta: deps.ptoVta, cbteTipo };
  let reservation: ComprobanteReservation | null = null;
  const held = () => {
    if (!reservation) {
      throw new Error("The emission settled a reservation it never took.");
    }

    return reservation;
  };

  return {
    client: deps.client,
    subject: subjectOf(cbteTipo),
    ...series,
    cbteFch: input.cbteFch,
    impTotal: plan.amount,
    emit: (request: ArcaEmissionRequest) =>
      emitVoucher(plan, deps, {
        ptoVta: deps.ptoVta,
        cbteNro: request.cbteNro,
        cbteFch: request.cbteFch,
        importe: plan.amount,
        condicionIvaReceptorId: deps.receptorIvaConditionId,
        ...serviceDates,
      }),
    reserve: async (request: ArcaEmissionRequest) => {
      reservation = await reserveCorrelative({
        anchor: input.input.anchor,
        academyId: context.academyId,
        eventId: input.input.eventId,
        ...series,
        cbteNro: request.cbteNro,
        cbteFch: request.cbteFch,
        // Frozen: a later change to the roster or the money does not alter
        // what this comprobante says (ADR-0011, #479).
        ...serviceDates,
        impTotal: plan.amount,
        issuerCuit: deps.issuerCuit,
        issuerIvaCondition: ISSUER_IVA_CONDITION,
        receptorDocTipo: DOC_TIPO_CONSUMIDOR_FINAL,
        receptorDocNro: String(DOC_NRO_CONSUMIDOR_FINAL),
        receptorIvaConditionId: deps.receptorIvaConditionId,
        associatedComprobanteId: factura?.id ?? null,
        lines: plan.lines.map((line) => toLineInput(input.input.anchor, line)),
      });

      if (reservation) {
        return null;
      }

      // Another emission of the series reserved between the check and the
      // insert.
      const blocking = await findBlockingReservation({
        ...series,
        anchor: input.input.anchor,
      });

      return blocking
        ? await blockedBy(blocking)
        : {
            ok: false as const,
            reason: "not-emitted" as const,
            message:
              "Otra emisión de la misma serie estaba en curso y no se emitió nada. Volvé a intentar.",
          };
    },
    persist: (authorized: Parameters<typeof recordReservedComprobante>[1]) =>
      recordReservedComprobante(held(), authorized),
    release: () => releaseReservation(held()),
    markNumberTaken: (
      taken: Parameters<typeof markReservationNumberTaken>[1],
    ) => markReservationNumberTaken(held(), taken),
  };
}

// The authorization each kind asks for: a note carries the invoice it amends
// in `CbtesAsoc`.
async function emitVoucher(
  plan: Extract<EmissionPlan<DocumentedRow>, { ok: true }>,
  deps: ComprobanteEmissionDeps,
  voucher: ClassCVoucherBase,
): Promise<FacturaCEmissionResult> {
  if (plan.kind === "factura_c") {
    return await deps.client.emitFacturaC(voucher);
  }

  const note = {
    ...voucher,
    emisorCuit: deps.issuerCuit,
    asociado: {
      cbteTipo: plan.factura.cbteTipo,
      ptoVta: plan.factura.ptoVta,
      cbteNro: plan.factura.cbteNro,
      cbteFch: plan.factura.cbteFch,
    },
  };

  return plan.kind === "nota_debito_c"
    ? await deps.client.emitNotaDebitoC(note)
    : await deps.client.emitNotaCreditoC(note);
}

function toLineInput(
  anchor: ComprobanteAnchor,
  line: PlannedLine,
): ComprobanteLineInput {
  return anchor.kind === "choreography"
    ? { choreographyInscriptionId: line.inscriptionId, amount: line.amount }
    : { seminarInscriptionId: line.inscriptionId, amount: line.amount };
}

type AnchorContext = {
  ok: true;
  academyId: string;
  // ARCA-formatted service period, already frozen: both ends are the seminar's
  // own date for a seminar unit, and the event's span for a choreography.
  serviceFrom: string;
  serviceTo: string;
};

/**
 * Validates that the anchor exists inside the named event and answers what the
 * emission needs from it. It is the one place the two kinds are told apart on
 * the way in; everything past it reads the same shape.
 */
async function resolveAnchorContext(
  input: ComprobanteEmissionInput,
  executor: ComprobanteExecutor,
): Promise<AnchorContext | EmissionFailure> {
  if (input.anchor.kind === "choreography") {
    const [choreography] = await executor
      .select({
        academyId: choreographies.academyId,
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
      academyId: choreography.academyId,
      serviceFrom: toArcaDate(getBusinessDateOnly(choreography.eventStartsAt)),
      serviceTo: toArcaDate(getBusinessDateOnly(choreography.eventEndsAt)),
    };
  }

  const [seminar] = await executor
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
    academyId: input.anchor.academyId,
    serviceFrom: seminarDate,
    serviceTo: seminarDate,
  };
}

/**
 * The two sides of the delta for one anchor: what each inscription owes —
 * withdrawn ones included, owing the deposit they retain (ADR-0014 §6, #1065) —
 * read through the same rollup the finance surfaces show, and every
 * comprobante the anchor already holds.
 */
async function readAnchorObligation(
  input: ComprobanteEmissionInput,
  context: AnchorContext,
  executor: ComprobanteExecutor,
) {
  const [unit, comprobantes] = await Promise.all([
    readUnitFinance(input, context, executor),
    listAnchorComprobantes(input.anchor, executor),
  ]);

  return {
    // With no active inscription left the minimum has nothing to read, and
    // the anchor is `Señada` vacuously (#657), as a withdrawn choreography
    // already reads: what its withdrawn rows retain is still owed, and the
    // zero-total check is what refuses an empty roster.
    financialStatus: unit.inscriptions.some(
      (inscription) => !inscription.withdrawn,
    )
      ? unit.financialStatus
      : ("paidInFull" as const),
    inscriptions: unit.inscriptions.map((inscription): OwedInscription => ({
      id: inscription.id,
      // A withdrawn row owes the deposit it retains, not whatever it still holds.
      owed: inscription.withdrawn
        ? deriveRetainedAmount(inscription)
        : inscription.totalAmount,
    })),
    comprobantes: comprobantes.map((comprobante) =>
      toDocumented(input.anchor, comprobante),
    ),
  };
}

async function readUnitFinance(
  input: ComprobanteEmissionInput,
  context: AnchorContext,
  executor: ComprobanteExecutor,
) {
  if (input.anchor.kind === "choreography") {
    return (
      (await readChoreographyUnitFinance({
        academyId: context.academyId,
        choreographyId: input.anchor.choreographyId,
        eventId: input.eventId,
        executor,
      })) ?? { financialStatus: "depositPending" as const, inscriptions: [] }
    );
  }

  return await readSeminarUnitFinance({
    academyId: input.anchor.academyId,
    eventId: input.eventId,
    executor,
    seminarId: input.anchor.seminarId,
  });
}

// A stored comprobante with its lines read as the plan reads them: by the
// inscription they name, whichever of the two kinds the anchor bills.
type DocumentedRow = Omit<ComprobanteWithLines, "lines"> &
  DocumentedComprobante;

function toDocumented(
  anchor: ComprobanteAnchor,
  comprobante: ComprobanteWithLines,
): DocumentedRow {
  return {
    ...comprobante,
    lines: comprobante.lines.map((line) => ({
      amount: line.amount,
      inscriptionId:
        anchor.kind === "choreography"
          ? line.choreographyInscriptionId
          : line.seminarInscriptionId,
    })),
  };
}

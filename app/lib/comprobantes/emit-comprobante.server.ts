import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, events, seminars } from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { readChoreographyUnitFinance } from "@/lib/finances/operational-summary.server";
import { readSeminarUnitFinance } from "@/lib/finances/seminar-operational-summary.server";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import { ArcaClient, getArcaClient } from "./arca/client.server";
import type {
  ArcaAttemptedVoucher,
  ArcaContingencySubject,
} from "./arca/contingency.server";
import {
  emitWithContingency,
  recheckWithContingency,
  toArcaDate,
  type ArcaEmissionChoreography,
  type ArcaEmissionFailureReason,
  type ArcaEmissionOutcome,
  type ArcaEmissionRequest,
} from "./arca/emission.server";
import {
  DOC_NRO_CONSUMIDOR_FINAL,
  DOC_TIPO_CONSUMIDOR_FINAL,
  type ClassCVoucherBase,
} from "./arca/factura-c";
import type {
  ArcaMessage,
  FacturaCEmissionResult,
  LastVoucherResult,
} from "./arca/responses";
import type { ComprobanteAnchor } from "./anchor";
import {
  lockComprobanteAnchor,
  type ComprobanteExecutor,
} from "./anchor-lock.server";
import {
  listAnchorComprobantes,
  recordComprobante,
  type ComprobanteLineInput,
  type ComprobanteWithLines,
} from "./comprobantes.server";
import {
  describeEmissionRefusal,
  planAnchorEmission,
  type DocumentedComprobante,
  type EmissionPlan,
  type EmissionRefusal,
  type OwedInscription,
  type PlannedLine,
} from "./emission-plan";
import { comprobanteKindCbteTipo } from "./kind";

type ComprobanteRow = Awaited<ReturnType<typeof recordComprobante>>;

// The issuer is `Proyecciones Artísticas Asociación Civil`, EXEMPT from VAT
// (#426): it always issues class C. The snapshot enum admits only this value.
const ISSUER_IVA_CONDITION = "exento" as const;

// Injectable emission inputs: the ARCA client (mockable in tests) and the sales
// point and recipient config. `cbteFch` is optional; it defaults to Córdoba's
// business date in ARCA format.
export type ComprobanteEmissionDeps = {
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
export type ComprobanteEmissionInput = {
  anchor: ComprobanteAnchor;
  eventId: string;
};

const seminarNotFoundMessage = "No encontramos ese seminario.";

export type ComprobanteEmissionFailureReason =
  "not-found" | EmissionRefusal | ArcaEmissionFailureReason;

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
      // Present only on a rejection from ARCA.
      arca?: {
        resultado: string | null;
        errors: ArcaMessage[];
        observaciones: ArcaMessage[];
      };
      // Present only on `unverified`: the comprobante that could not be resolved.
      attempt?: ArcaAttemptedVoucher;
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
 * The `CbteNro` is derived from `FECompUltimoAutorizado + 1` in the document's
 * own series. Only an approved CAE persists the comprobante with its snapshot;
 * a rejection from ARCA — 10197 included, which arrives in `Observaciones`
 * with `Resultado` "R" and no `Errors` — persists nothing.
 *
 * When ARCA does not answer, the failure is classified by phase (ADR-0012). If
 * the correlative query was cut, nothing was authorized. If the authorization
 * was cut, ARCA is queried for the exact comprobante that was attempted: when it
 * comes back and matches what was sent, it HAD been authorized and is persisted
 * with that CAE; when it does not come back and the authorization had failed in
 * transport, nothing was emitted. When the query fails, returns a different
 * comprobante, or does not find it but the authorization timed out — so it is
 * still in flight and may be authorized later — the result is `unverified` and
 * nothing is persisted.
 */
export async function emitAnchorComprobante(
  input: ComprobanteEmissionInput,
  deps: ComprobanteEmissionDeps,
): Promise<ComprobanteEmissionOutcome> {
  return await underAnchorLock(input.anchor, async (tx) => {
    const resolved = await resolveEmissionChoreography(input, deps, tx);

    if (!resolved.ok) {
      return resolved;
    }

    return toOutcome(await emitWithContingency(resolved.choreography));
  });
}

/**
 * Re-verifies against ARCA an emission left unresolved (#577), for the sequence
 * number the dialog carries over from the previous attempt. It re-plans the
 * anchor — which is where the document's kind and the amount the queried
 * comprobante is validated against come from — so if somebody touched the
 * roster or the money in the meantime, the amount does not match and the
 * result stays `unverified`.
 */
export async function recheckAnchorComprobante(
  input: ComprobanteEmissionInput & { cbteNro: number },
  deps: ComprobanteEmissionDeps,
): Promise<ComprobanteEmissionOutcome> {
  return await underAnchorLock(input.anchor, async (tx) => {
    const resolved = await resolveEmissionChoreography(input, deps, tx);

    if (!resolved.ok) {
      return resolved;
    }

    return toOutcome(
      await recheckWithContingency(resolved.choreography, input.cbteNro),
    );
  });
}

/**
 * What the anchor owes right now, for the financial detail to preview and to
 * explain a refusal with. It reads outside the lock: the emission plans again
 * under it, so a preview gone stale costs a refusal, never a document.
 */
export async function readAnchorEmissionPlan(
  input: ComprobanteEmissionInput,
): Promise<EmissionPlan<DocumentedRow> | EmissionFailure> {
  const context = await resolveAnchorContext(input, db);

  if (!context.ok) {
    return context;
  }

  return planAnchorEmission(await readAnchorObligation(input, context, db));
}

/**
 * Runs one emission with the unit serialised: a transaction that takes the
 * anchor's advisory lock before anything reads what is owed or documented, so
 * the plan and the insert that follows it are one indivisible decision about
 * the same delta (`anchor-lock.server.ts`).
 *
 * ARCA is called from inside the transaction, which is the price of the lock
 * covering the authorization too: the alternative is holding the lock only
 * around the read, which lets a second emission authorize the same delta while
 * the first is still waiting on ARCA. The client's own timeouts bound how long
 * the transaction can stay open.
 */
async function underAnchorLock(
  anchor: ComprobanteAnchor,
  run: (tx: ComprobanteExecutor) => Promise<ComprobanteEmissionOutcome>,
): Promise<ComprobanteEmissionOutcome> {
  return await db.transaction(async (tx) => {
    await lockComprobanteAnchor(tx, anchor);

    return await run(tx);
  });
}

function toOutcome(
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

/**
 * Plans the anchor and assembles the ARCA choreography of the document it
 * owes. Emission and re-verification share it, since re-verification needs
 * exactly the same inputs — the kind, the amount and the date a recovered
 * comprobante is validated against (ADR-0012 decision 4) — computed on the
 * server rather than taken from the form.
 */
async function resolveEmissionChoreography(
  input: ComprobanteEmissionInput,
  deps: ComprobanteEmissionDeps,
  executor: ComprobanteExecutor,
): Promise<
  | { ok: true; choreography: ArcaEmissionChoreography<ComprobanteRow> }
  | EmissionFailure
> {
  const context = await resolveAnchorContext(input, executor);

  if (!context.ok) {
    return context;
  }

  const plan = planAnchorEmission(
    await readAnchorObligation(input, context, executor),
  );

  if (!plan.ok) {
    return {
      ok: false,
      reason: plan.reason,
      message: describeEmissionRefusal(plan.reason).reason,
    };
  }

  const document = documentSeries(plan, deps);
  // The note mirrors the invoice's service period, which is the unit's and
  // stable across its documents; the invoice takes the unit's own.
  const factura = plan.kind === "factura_c" ? null : plan.factura;
  const serviceDates = (cbteFch: string) => ({
    fchServDesde: factura?.fchServDesde ?? context.serviceFrom,
    fchServHasta: factura?.fchServHasta ?? context.serviceTo,
    // Each comprobante's own date (ADR-0014 §8): WSFEv1 wants it no earlier
    // than `CbteFch`, so a note cannot copy the invoice's.
    fchVtoPago: cbteFch,
  });

  const choreography: ArcaEmissionChoreography<ComprobanteRow> = {
    client: deps.client,
    subject: document.subject,
    ptoVta: deps.ptoVta,
    cbteTipo: document.cbteTipo,
    cbteFch: deps.cbteFch,
    impTotal: plan.amount,
    getLastNumber: document.getLastNumber,
    emit: (request: ArcaEmissionRequest) =>
      document.emit({
        ptoVta: deps.ptoVta,
        cbteNro: request.cbteNro,
        cbteFch: request.cbteFch,
        importe: plan.amount,
        condicionIvaReceptorId: deps.receptorIvaConditionId,
        ...serviceDates(request.cbteFch),
      }),
    persist: (authorized, request): Promise<ComprobanteRow> =>
      recordComprobante(
        {
          anchor: input.anchor,
          eventId: input.eventId,
          cbteTipo: document.cbteTipo,
          ptoVta: deps.ptoVta,
          cbteNro: authorized.cbteNro,
          cbteFch: authorized.cbteFch,
          // Frozen: a later change to the roster or the money does not alter
          // what this comprobante says (ADR-0011, #479).
          ...serviceDates(request.cbteFch),
          impTotal: plan.amount,
          issuerCuit: deps.issuerCuit,
          issuerIvaCondition: ISSUER_IVA_CONDITION,
          receptorDocTipo: DOC_TIPO_CONSUMIDOR_FINAL,
          receptorDocNro: String(DOC_NRO_CONSUMIDOR_FINAL),
          receptorIvaConditionId: deps.receptorIvaConditionId,
          cae: authorized.cae,
          caeVto: authorized.caeVto,
          associatedComprobanteId: factura?.id ?? null,
          lines: plan.lines.map((line) => toLineInput(input.anchor, line)),
        },
        // Inside the lock's transaction: a row inserted outside it would exist
        // after the lock that protects its plan was already released.
        executor,
      ),
  };

  return { ok: true, choreography };
}

type DocumentSeries = {
  cbteTipo: number;
  subject: ArcaContingencySubject;
  getLastNumber: () => Promise<LastVoucherResult>;
  emit: (voucher: ClassCVoucherBase) => Promise<FacturaCEmissionResult>;
};

// Each kind numbers on its own series, names itself in a contingency message,
// and a note carries the invoice it amends in `CbtesAsoc`.
function documentSeries(
  plan: Extract<EmissionPlan<DocumentedRow>, { ok: true }>,
  deps: ComprobanteEmissionDeps,
): DocumentSeries {
  const cbteTipo = comprobanteKindCbteTipo(plan.kind);

  if (plan.kind === "factura_c") {
    return {
      cbteTipo,
      subject: "comprobante",
      getLastNumber: () => deps.client.getLastFacturaCNumber(deps.ptoVta),
      emit: (voucher) => deps.client.emitFacturaC(voucher),
    };
  }

  const note = (voucher: ClassCVoucherBase) => ({
    ...voucher,
    emisorCuit: deps.issuerCuit,
    asociado: {
      cbteTipo: plan.factura.cbteTipo,
      ptoVta: plan.factura.ptoVta,
      cbteNro: plan.factura.cbteNro,
      cbteFch: plan.factura.cbteFch,
    },
  });

  return plan.kind === "nota_debito_c"
    ? {
        cbteTipo,
        subject: "nota de débito",
        getLastNumber: () => deps.client.getLastNotaDebitoCNumber(deps.ptoVta),
        emit: (voucher) => deps.client.emitNotaDebitoC(note(voucher)),
      }
    : {
        cbteTipo,
        subject: "nota de crédito",
        getLastNumber: () => deps.client.getLastNotaCreditoCNumber(deps.ptoVta),
        emit: (voucher) => deps.client.emitNotaCreditoC(note(voucher)),
      };
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
 * withdrawn ones included, owing what they retained (ADR-0014 §6) — read
 * through the same rollup the finance surfaces show, and every comprobante the
 * anchor already holds.
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
    financialStatus: unit.financialStatus,
    inscriptions: unit.inscriptions.map((inscription): OwedInscription => ({
      id: inscription.id,
      owed: inscription.totalAmount,
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

/**
 * Resolves the production emission inputs from the environment: the shared ARCA
 * client (with its TA cache) plus the sales point and the recipient's VAT
 * condition. The tests inject a mocked client and do not come through here.
 */
export function getComprobanteEmissionDeps(
  env: NodeJS.ProcessEnv = process.env,
): ComprobanteEmissionDeps {
  return {
    client: getArcaClient(env),
    ...readComprobanteEmissionConfig(env),
  };
}

export function readComprobanteEmissionConfig(
  env: NodeJS.ProcessEnv = process.env,
): Pick<
  ComprobanteEmissionDeps,
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

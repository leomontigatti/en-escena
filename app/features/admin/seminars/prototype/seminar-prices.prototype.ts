// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// The event-level seminar price model of the admin seminar-money prototype for
// wayfinder ticket #890 (map #884), as #904 decided: the rows, their labels, the
// kind fallback, the picker's candidates and the readiness cells.

/** The business date the prototype reads prices against. */
const prototypeToday = "2026-09-10";

export type SeminarKind = "regular" | "special";

export const seminarKindOptions = [
  { value: "regular", label: "Común" },
  { value: "special", label: "Exclusivo" },
] as const satisfies ReadonlyArray<{ value: SeminarKind; label: string }>;

/** One dated event-level row for a kind and a participant flag (#904). */
export type SeminarPriceRow = {
  id: string;
  name: string;
  kind: SeminarKind;
  forParticipants: boolean;
  paymentDeadline: string | null;
  amount: number;
};

export type SeminarPriceUsage = {
  /** Inscriptions whose stored row is this one, withdrawn rows included: any freezes every field and the delete. */
  referencedCount: number;
  /** The deadline-less `Común` row of its participant cell while the event has active seminar inscriptions: only its amount may change. */
  isProtected: boolean;
};

// No `Exclusivo` row for non-participants: an `Exclusivo` seminar prices them
// through the `Común` rows (the kind fallback). There is no fallback the other
// way, from non-participants to participants.
export const eventSeminarPrices: SeminarPriceRow[] = [
  {
    id: "comun-participantes-septiembre",
    name: "Participantes preventa",
    kind: "regular",
    forParticipants: true,
    paymentDeadline: "2026-09-20",
    amount: 30000,
  },
  {
    id: "comun-participantes-octubre",
    name: "Participantes octubre",
    kind: "regular",
    forParticipants: true,
    paymentDeadline: "2026-10-05",
    amount: 35000,
  },
  {
    id: "comun-participantes-sin-fecha",
    name: "Participantes",
    kind: "regular",
    forParticipants: true,
    paymentDeadline: null,
    amount: 40000,
  },
  {
    id: "comun-no-participantes-septiembre",
    name: "Público preventa",
    kind: "regular",
    forParticipants: false,
    paymentDeadline: "2026-09-20",
    amount: 40000,
  },
  {
    id: "comun-no-participantes-sin-fecha",
    name: "Público general",
    kind: "regular",
    forParticipants: false,
    paymentDeadline: null,
    amount: 50000,
  },
  {
    id: "exclusivo-participantes-septiembre",
    name: "Exclusivo participantes preventa",
    kind: "special",
    forParticipants: true,
    paymentDeadline: "2026-09-20",
    amount: 45000,
  },
  {
    id: "exclusivo-participantes-sin-fecha",
    name: "Exclusivo participantes",
    kind: "special",
    forParticipants: true,
    paymentDeadline: null,
    amount: 55000,
  },
];

export function formatSeminarKindLabel(kind: SeminarKind) {
  return kind === "special" ? "Exclusivo" : "Común";
}

export function formatParticipantsLabel(forParticipants: boolean) {
  return forParticipants ? "Participantes" : "No participantes";
}

/** The badge beside the kind in the price list. */
export function formatParticipantBadgeLabel(forParticipants: boolean) {
  return forParticipants ? "Participante" : "No participante";
}

export function depositFor(amount: number, rate: number) {
  return Math.round((amount * rate) / 100);
}

function compareDeadlines(left: string | null, right: string | null) {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  return right === null ? -1 : left.localeCompare(right);
}

function selectApplicable(rows: SeminarPriceRow[]) {
  return (
    rows
      .filter(
        (row) =>
          row.paymentDeadline === null || row.paymentDeadline >= prototypeToday,
      )
      .sort((left, right) =>
        compareDeadlines(left.paymentDeadline, right.paymentDeadline),
      )[0] ?? null
  );
}

/**
 * Today's row for a seminar kind and a participant fact: the kind's rows first,
 * then the `Común` ones, as a schedule price falls back to the general one. No
 * fallback on the participant axis (#904).
 */
export function resolveCurrentSeminarPrice(
  rows: SeminarPriceRow[],
  kind: SeminarKind,
  participating: boolean,
) {
  const cell = rows.filter((row) => row.forParticipants === participating);
  const ofKind =
    kind === "regular"
      ? null
      : selectApplicable(cell.filter((row) => row.kind === kind));

  return (
    ofKind ?? selectApplicable(cell.filter((row) => row.kind === "regular"))
  );
}

/** What the dialog's picker offers: the kind's rows, then the `Común` ones, of the person's cell, with no date filter. */
export function listPickableSeminarPrices(
  rows: SeminarPriceRow[],
  kind: SeminarKind,
  participating: boolean,
) {
  return rows
    .filter(
      (row) =>
        row.forParticipants === participating &&
        (row.kind === kind || row.kind === "regular"),
    )
    .sort((left, right) =>
      left.kind === right.kind
        ? compareDeadlines(left.paymentDeadline, right.paymentDeadline)
        : left.kind === kind
          ? -1
          : 1,
    );
}

/** The participant cells missing their deadline-less `Común` row, which keeps every seminar of the event closed (#904). */
export function listMissingBaseCells(rows: SeminarPriceRow[]) {
  return [true, false].filter(
    (forParticipants) =>
      !rows.some(
        (row) =>
          row.kind === "regular" &&
          row.forParticipants === forParticipants &&
          row.paymentDeadline === null,
      ),
  );
}

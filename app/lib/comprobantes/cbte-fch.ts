import { formatComprobanteArcaDate } from "./format";
import { formatComprobanteSeriesLabel } from "./kind";

// How far back a services comprobante (WSFEv1 `Concepto` 2) may be dated,
// counted from the day it is sent to ARCA (validation 10016).
const CBTE_FCH_BACKDATE_DAYS = 10;

/**
 * The dates a comprobante of one series may carry (ADR-0014 §5). ARCA's 10016
 * is excluding on two axes at once: the date is at most ten days back, and it
 * is never earlier than the last authorized comprobante's of the same
 * `(ptoVta, cbteTipo)`, a ratchet each authorization raises for good. The
 * upper bound is today: a date ahead of it would raise that ratchet for every
 * comprobante after it.
 *
 * Dates are business dates, `AAAA-MM-DD`, as the form sends them.
 */
export type CbteFchBounds = {
  series: { ptoVta: number; cbteTipo: number };
  floor: string;
  // Which axis sets the floor: the series' last date, or the ten-day window.
  floorReason: "series" | "window";
  max: string;
};

export function deriveCbteFchBounds(input: {
  series: { ptoVta: number; cbteTipo: number };
  today: string;
  // In ARCA's `AAAAMMDD`; `null` when the series has none.
  lastAuthorizedCbteFch: string | null;
}): CbteFchBounds {
  const window = shiftDate(input.today, -CBTE_FCH_BACKDATE_DAYS);
  const last =
    input.lastAuthorizedCbteFch === null
      ? null
      : fromArcaDate(input.lastAuthorizedCbteFch);

  return last !== null && last > window
    ? {
        series: input.series,
        floor: last,
        floorReason: "series",
        max: input.today,
      }
    : {
        series: input.series,
        floor: window,
        floorReason: "window",
        max: input.today,
      };
}

/**
 * Why `cbteFch` cannot go out in its series, in the words the operator reads,
 * or `null` when it can. It runs before ARCA is called, so a date ARCA would
 * refuse never consumes the attempt.
 */
export function checkCbteFch(
  cbteFch: string,
  bounds: CbteFchBounds,
): string | null {
  if (!isDateOnly(cbteFch)) {
    return "Elegí una fecha válida para el comprobante.";
  }

  if (cbteFch > bounds.max) {
    return "La fecha no puede ser posterior a hoy.";
  }

  if (cbteFch < bounds.floor) {
    return `La fecha no puede ser anterior al ${describeCbteFchFloor(bounds)}.`;
  }

  return null;
}

/**
 * The floor and what sets it, as the emission surface shows it under the date
 * and the refusal repeats it: the series is always named, since the three
 * kinds ratchet independently.
 */
export function describeCbteFchFloor(bounds: CbteFchBounds): string {
  const floor = formatComprobanteArcaDate(toArcaDateOnly(bounds.floor));
  const series = formatComprobanteSeriesLabel(bounds.series);

  return bounds.floorReason === "series"
    ? `${floor}, la del último comprobante autorizado en la serie ${series}: ARCA no acepta fechas anteriores en esa serie`
    : `${floor}: ARCA no acepta comprobantes de servicios fechados más de ${CBTE_FCH_BACKDATE_DAYS} días antes de hoy (${series})`;
}

function isDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function shiftDate(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function fromArcaDate(arcaDate: string): string {
  return `${arcaDate.slice(0, 4)}-${arcaDate.slice(4, 6)}-${arcaDate.slice(6, 8)}`;
}

function toArcaDateOnly(dateOnly: string): string {
  return dateOnly.replaceAll("-", "");
}

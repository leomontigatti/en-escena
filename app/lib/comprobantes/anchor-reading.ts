import { formatComprobanteArcaDate } from "./format";

/**
 * How a persisted anchor **reads** on a surface: the choreography's name, or the
 * seminar's instructor and date, which is how a seminar is named everywhere (it
 * has no name of its own). It is the display twin of `ComprobanteAnchor`: the
 * anchor says what a comprobante belongs to, this says what the operator sees,
 * and keeping them apart is what lets the list, the detail and the printed
 * document read one comprobante the same way without joining the same tables
 * three times over.
 */
export type ComprobanteAnchorReading =
  | {
      kind: "choreography";
      choreographyId: string;
      choreographyName: string;
    }
  | {
      kind: "seminar";
      seminarId: string;
      instructorName: string;
      // The seminar's local business date, as the column holds it.
      scheduledDate: string;
    };

/**
 * The one-line reading of the anchor. A choreography reads as its name and
 * nothing else, which is what every surface already printed; a seminar reads
 * `Seminario {instructor}, {fecha}` — the noun is part of the reading because
 * the two kinds share one column and one receptor block, and an instructor's
 * name alone would not say which it is.
 */
export function formatComprobanteAnchorLabel(
  reading: ComprobanteAnchorReading,
): string {
  return reading.kind === "choreography"
    ? reading.choreographyName
    : `Seminario ${reading.instructorName}, ${formatAnchorDate(
        reading.scheduledDate,
      )}`;
}

/**
 * The financial detail the reading links to: the choreography's for one kind,
 * the `(seminar, academy)` unit's for the other. Both hang off the academy,
 * which the root records on every row.
 */
export function comprobanteAnchorHref(input: {
  academyId: string;
  reading: ComprobanteAnchorReading;
}): string {
  const base = `/administracion/finanzas/${input.academyId}`;

  return input.reading.kind === "choreography"
    ? `${base}/coreografias/${input.reading.choreographyId}`
    : `${base}/seminarios/${input.reading.seminarId}`;
}

// A local business date `AAAA-MM-DD` as `DD/MM/AAAA`, which is how every other
// date on the printed document reads (the fiscal dates travel in ARCA's format
// and go through the same formatter).
function formatAnchorDate(scheduledDate: string): string {
  return formatComprobanteArcaDate(scheduledDate.replaceAll("-", ""));
}

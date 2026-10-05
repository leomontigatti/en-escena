import { z } from "zod";

import { isDateOnly } from "@/lib/shared/date-only";
import { slugify } from "@/lib/shared/slugify";

/**
 * What the auditor's spreadsheet exports and the dialog that starts them agree
 * on: a period of the selected event, given as an optional `Desde` and an
 * optional `Hasta`. Both are inclusive days read in Argentina time; an empty
 * one leaves that end open, so two empty dates are the whole event.
 */

export const periodFromParam = "desde";
export const periodToParam = "hasta";

export type ExportPeriod = {
  /** A date-only value, or `null` for "from the start". */
  from: string | null;
  /** A date-only value, or `null` for "up to now". */
  to: string | null;
};

export const periodToBeforeFromMessage =
  "La fecha hasta no puede ser anterior a la fecha desde.";

export const exportPeriodSchema = z
  .object({
    [periodFromParam]: z.string(),
    [periodToParam]: z.string(),
  })
  .refine(
    (values) =>
      !values[periodFromParam] ||
      !values[periodToParam] ||
      values[periodFromParam] <= values[periodToParam],
    { message: periodToBeforeFromMessage, path: [periodToParam] },
  );

export type ExportPeriodFormValues = z.infer<typeof exportPeriodSchema>;

export function buildPeriodExportHref(path: string, period: ExportPeriod) {
  const params = new URLSearchParams();

  if (period.from) {
    params.set(periodFromParam, period.from);
  }

  if (period.to) {
    params.set(periodToParam, period.to);
  }

  const query = params.toString();

  return query ? `${path}?${query}` : path;
}

/**
 * The period a download asks for. A value that is not a date is read as no
 * date: the dialog never sends one, and a hand-edited address gets the wider
 * file rather than an error page in place of the list.
 */
export function readExportPeriod(searchParams: URLSearchParams): ExportPeriod {
  const read = (name: string) => {
    const value = searchParams.get(name);

    return value && isDateOnly(value) ? value : null;
  };

  return { from: read(periodFromParam), to: read(periodToParam) };
}

/** The file says which period it holds, so two downloads never look alike. */
export function buildPeriodExportFileName(
  prefix: string,
  eventName: string,
  period: ExportPeriod,
) {
  const range =
    period.from === null && period.to === null
      ? "completo"
      : `${period.from ?? "inicio"}-a-${period.to ?? "hoy"}`;

  return `${prefix}-${slugify(eventName)}-${range}.xlsx`;
}

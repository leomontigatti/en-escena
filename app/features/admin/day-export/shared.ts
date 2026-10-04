import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";
import { slugify } from "@/lib/shared/slugify";

/**
 * What every spreadsheet export and the dialog that starts it agree on: the
 * parameter the choice travels in, the choice that takes every day, and how
 * the file is named. The choice is one day of the event or all of them.
 */

export const exportDayParam = "dia";
/** The choice that exports every day, listed first in the dialog. */
export const exportAllDays = "todos";

export const exportDaySchema = z.object({
  [exportDayParam]: z.string().min(1, requiredFieldMessage),
});

export type ExportDayFormValues = z.infer<typeof exportDaySchema>;

export function buildExportHref(path: string, day: string) {
  const params = new URLSearchParams({ [exportDayParam]: day });

  return `${path}?${params.toString()}`;
}

/** `day` is a date or `exportAllDays`, and the name says which. */
export function buildExportFileName(
  prefix: string,
  eventName: string,
  day: string,
) {
  return `${prefix}-${slugify(eventName)}-${day}.xlsx`;
}

export function isOnExportDay(day: string, scheduledDate: string) {
  return day === exportAllDays || scheduledDate === day;
}

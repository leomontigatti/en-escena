import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";
import { slugify } from "@/lib/shared/slugify";

/**
 * What the program export and the dialog that starts it agree on: where the
 * download lives, the parameter the choice travels in, and what the file is
 * called. The choice is one day of the event or all of them.
 */

const programExportPath = "/administracion/presentaciones/exportar";
export const programExportDayParam = "dia";
/** The choice that exports every day, listed first in the dialog. */
export const programExportAllDays = "todos";

export const programExportSchema = z.object({
  [programExportDayParam]: z.string().min(1, requiredFieldMessage),
});

export type ProgramExportFormValues = z.infer<typeof programExportSchema>;

export function buildProgramExportHref(day: string) {
  const params = new URLSearchParams({ [programExportDayParam]: day });

  return `${programExportPath}?${params.toString()}`;
}

/** `day` is a date or `programExportAllDays`, and the name says which. */
export function buildProgramExportFileName(eventName: string, day: string) {
  return `programa-${slugify(eventName)}-${day}.xlsx`;
}

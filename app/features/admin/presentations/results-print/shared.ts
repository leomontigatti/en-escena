import { z } from "zod";

import type { Award } from "@/lib/judging/award";
import type { EventProgramRow } from "@/lib/presentations/event-program.server";

/**
 * What the results print and the dialog that opens it agree on: where the
 * print lives, the query parameter each chosen schedule travels in, and the
 * dialog's one rule: at least one schedule.
 */

const resultsPrintPath = "/administracion/presentacion/resultados/imprimir";
export const resultsPrintScheduleParam = "cronograma";

export const resultsPrintSchema = z.object({
  [resultsPrintScheduleParam]: z
    .array(z.string())
    .min(1, "Elegí al menos un cronograma."),
});

export type ResultsPrintFormValues = z.infer<typeof resultsPrintSchema>;

/**
 * A row of the printed program, with what the panel's work added up to. Only a
 * presentation with a result is printed, so both are always there.
 */
export type ResultsPrintRow = EventProgramRow & {
  average: number;
  award: Award;
};

export function buildResultsPrintHref(scheduleIds: readonly string[]) {
  const params = new URLSearchParams(
    scheduleIds.map((scheduleId) => [resultsPrintScheduleParam, scheduleId]),
  );

  return `${resultsPrintPath}?${params.toString()}`;
}

import { z } from "zod";

import type {
  ActionData,
  SeminarPriceActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import { hasCompleteSeminarPriceCells } from "@/lib/seminar-prices/participant-cells";
import type { SeminarPriceListItem } from "@/lib/seminar-prices/repository.server";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const seminarPriceFormSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
  forParticipants: z.boolean(),
  kind: z.string().min(1, requiredFieldMessage),
  amount: z
    .string()
    .min(1, requiredFieldMessage)
    .refine((value) => {
      const amount = Number(value);

      return Number.isInteger(amount) && amount > 0;
    }, "Ingresá un monto mayor a cero."),
  paymentDeadline: z.string().trim(),
});

export type SeminarPriceFormValues = z.input<typeof seminarPriceFormSchema>;

export const participantsSwitchLabel = "Para participantes";

/**
 * The warning above the `Precios` tabs: while a participant cell has no
 * deadline-less `Común` row, every seminar of the event is closed to
 * registration, which is not something the seminar list itself can say. It
 * names no cell, because it sits above both tabs and the table already shows
 * which rows exist.
 */
export function readMissingSeminarPriceCellsWarning(
  seminarPrices: SeminarPriceListItem[],
) {
  if (hasCompleteSeminarPriceCells(seminarPrices)) {
    return null;
  }

  return "Existen combinaciones de seminario sin un precio general sin fecha límite. Agregalas para habilitar las inscripciones.";
}

export function getSeminarPriceSubmittedValues(
  actionData: ActionData | undefined,
  intent: string,
  recordId?: string,
) {
  if (
    actionData?.scope?.intent !== intent ||
    actionData.scope.recordId !== recordId ||
    !isSeminarPriceActionValues(actionData.values)
  ) {
    return undefined;
  }

  return actionData.values;
}

function isSeminarPriceActionValues(
  values: ActionData["values"] | undefined,
): values is SeminarPriceActionValues {
  return (
    values !== undefined &&
    "kind" in values &&
    "forParticipants" in values &&
    "amount" in values &&
    "paymentDeadline" in values &&
    "name" in values
  );
}

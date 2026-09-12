import { z } from "zod";

import type {
  ActionData,
  SeminarPriceActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  findUncoveredParticipantCells,
  getParticipantCellPhrase,
} from "@/lib/seminar-prices/participant-cells";
import {
  uncoveredSeminarPriceDeleteError,
  uncoveredSeminarPriceUpdateError,
} from "@/lib/seminar-prices/guard-messages";
import type { SeminarPriceListItem } from "@/lib/seminar-prices/repository.server";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { seminarKindLabels } from "@/lib/seminars/seminar-kinds";

export const seminarPriceFormSchema = z
  .object({
    name: z.string().trim().min(1, requiredFieldMessage),
    forParticipants: z.boolean(),
    isOpenEnded: z.boolean(),
    kind: z.string().min(1, requiredFieldMessage),
    amount: z
      .string()
      .min(1, requiredFieldMessage)
      .refine((value) => {
        const amount = Number(value);

        return Number.isInteger(amount) && amount > 0;
      }, "Ingresá un monto mayor a cero."),
    paymentDeadline: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (!values.isOpenEnded && values.paymentDeadline.length === 0) {
      context.addIssue({
        code: "custom",
        message: requiredFieldMessage,
        path: ["paymentDeadline"],
      });
    }
  });

export type SeminarPriceFormValues = z.infer<typeof seminarPriceFormSchema>;

export const participantsSwitchLabel = "Para participantes";

/**
 * What the guards would refuse on a row, read from the row itself so the form
 * locks a field on sight instead of refusing after the save. A referenced row
 * is frozen except for its name; the tail that keeps the event's seminars open
 * also keeps its amount. The server refuses all the same, for the race.
 */
export type SeminarPriceGuard = {
  canEditAmount: boolean;
  canEditStructure: boolean;
  canDelete: boolean;
  reason: string | null;
};

export function readSeminarPriceGuard(
  seminarPrice: Pick<
    SeminarPriceListItem,
    "isReferenced" | "keepsRegistrationOpen" | "forParticipants"
  >,
): SeminarPriceGuard {
  if (seminarPrice.isReferenced) {
    return {
      canEditAmount: false,
      canEditStructure: false,
      canDelete: false,
      reason:
        "Hay inscripciones que congelaron este precio, así que solo podés cambiarle el nombre.",
    };
  }

  if (seminarPrice.keepsRegistrationOpen) {
    return {
      canEditAmount: true,
      canEditStructure: false,
      canDelete: false,
      reason: uncoveredSeminarPriceUpdateError(seminarPrice.forParticipants),
    };
  }

  return {
    canEditAmount: true,
    canEditStructure: true,
    canDelete: true,
    reason: null,
  };
}

/** Why the delete dialog opens blocked, or `null` when it does not. */
export function readSeminarPriceDeletionBlock(
  seminarPrice: Pick<
    SeminarPriceListItem,
    "isReferenced" | "keepsRegistrationOpen" | "forParticipants"
  >,
) {
  if (seminarPrice.isReferenced) {
    return "Hay inscripciones que congelaron este precio, así que no se puede borrar.";
  }

  if (seminarPrice.keepsRegistrationOpen) {
    return uncoveredSeminarPriceDeleteError(seminarPrice.forParticipants);
  }

  return null;
}

/**
 * The warning above the table: while a participant cell has no deadline-less
 * `Común` row, every seminar of the event is closed to registration, which is
 * not something the seminar list itself can say.
 */
export function readMissingSeminarPriceCellsWarning(
  seminarPrices: SeminarPriceListItem[],
) {
  const uncoveredCells = findUncoveredParticipantCells(seminarPrices);

  if (uncoveredCells.length === 0) {
    return null;
  }

  const cells = uncoveredCells
    .map((forParticipants) => getParticipantCellPhrase(forParticipants))
    .join(" y ");

  return `Falta el precio ${seminarKindLabels.regular} sin fecha límite para ${cells}. Hasta que exista, ninguna academia puede inscribir en los seminarios del evento.`;
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
    "name" in values &&
    "isOpenEnded" in values
  );
}

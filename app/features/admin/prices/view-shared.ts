import { z } from "zod";

import type {
  ActionData,
  PriceActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import type { PriceListItem } from "@/lib/events/bases.server";
import { groupTypeLabels } from "@/lib/events/group-types";
import {
  frozenPriceDeleteError,
  frozenPriceUpdateError,
  uncoveredPriceDeleteError,
  uncoveredPriceUpdateError,
} from "@/lib/prices/guard-messages";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const EMPTY_SCHEDULE_VALUE = "__empty_schedule__";

// A price with no `paymentDeadline` never expires: it is the row that applies
// once every dated rung of the ladder has passed. "Precio base" is already the
// UI term for `selectedPrice` (CONTEXT.md), so this row is named after the
// absence itself rather than borrowing that term.
export const openEndedDeadlineLabel = "Sin fecha límite";

// The same absence inside a sentence, where `getPriceDisplayName` reads it as
// the tail of "Solo - Precio base - ...".
const openEndedDeadlinePhrase = "sin fecha límite";

const priceDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "numeric",
  year: "2-digit",
  timeZone: "UTC",
});

const priceTableDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const priceAmountFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export const priceFormSchema = z
  .object({
    name: z.string().trim().min(1, requiredFieldMessage),
    isSpecialPrice: z.boolean(),
    groupType: z.string().min(1, requiredFieldMessage),
    amount: z
      .string()
      .min(1, requiredFieldMessage)
      .refine((value) => {
        const amount = Number(value);

        return Number.isInteger(amount) && amount > 0;
      }, "Ingresá un monto mayor a cero."),
    paymentDeadline: z.string().trim(),
    scheduleId: z.string(),
  })
  .superRefine((values, context) => {
    if (
      values.isSpecialPrice &&
      values.scheduleId.trim() === EMPTY_SCHEDULE_VALUE
    ) {
      context.addIssue({
        code: "custom",
        message: requiredFieldMessage,
        path: ["scheduleId"],
      });
    }
  });

export type PriceFormValues = z.infer<typeof priceFormSchema>;

/**
 * What the guards would refuse on a row, read from the row itself so the form
 * locks a field on sight instead of refusing after the save. A frozen row is
 * editable down to its name; the tail that keeps its group type resolvable also
 * keeps its amount. The server refuses all the same, for the race.
 */
export type PriceGuard = {
  canEditAmount: boolean;
  canEditStructure: boolean;
  canDelete: boolean;
  reason: string | null;
};

export function readPriceGuard(
  price: Pick<PriceListItem, "isFrozen" | "keepsCoverage">,
): PriceGuard {
  if (price.isFrozen) {
    return {
      canEditAmount: false,
      canEditStructure: false,
      canDelete: false,
      reason: frozenPriceUpdateError,
    };
  }

  if (price.keepsCoverage) {
    return {
      canEditAmount: true,
      canEditStructure: false,
      canDelete: false,
      reason: uncoveredPriceUpdateError,
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
export function readPriceDeletionBlock(
  price: Pick<PriceListItem, "isFrozen" | "keepsCoverage">,
) {
  if (price.isFrozen) {
    return frozenPriceDeleteError;
  }

  if (price.keepsCoverage) {
    return uncoveredPriceDeleteError;
  }

  return null;
}

export function getGroupTypeLabel(groupType: string) {
  return groupTypeLabels[groupType] ?? groupType;
}

export function getPriceDisplayName(price: PriceListItem) {
  if (price.name) {
    return price.name;
  }

  const groupTypeLabel = getGroupTypeLabel(price.groupType);
  const scopeLabel = price.schedule?.name ?? getPriceScopeLabel(price);
  const deadlineLabel = formatPaymentDeadlineForDisplay(price.paymentDeadline);

  return deadlineLabel
    ? `${groupTypeLabel} - ${scopeLabel} - hasta ${deadlineLabel}`
    : `${groupTypeLabel} - ${scopeLabel} - ${openEndedDeadlinePhrase}`;
}

export function getPriceName(price: PriceListItem) {
  return price.name ?? getPriceDisplayName(price);
}

export function formatPaymentDeadlineForTable(paymentDeadline: string | null) {
  if (!paymentDeadline) {
    return openEndedDeadlineLabel;
  }

  return priceTableDateFormatter.format(
    new Date(`${paymentDeadline}T00:00:00Z`),
  );
}

export function formatAmount(amount: number) {
  return priceAmountFormatter.format(amount).replace(/\u00a0/g, " ");
}

export function getPriceSubmittedValues(
  actionData: ActionData | undefined,
  intent: string,
  recordId?: string,
) {
  if (
    actionData?.scope?.intent !== intent ||
    actionData.scope.recordId !== recordId ||
    !isPriceActionValues(actionData.values)
  ) {
    return undefined;
  }

  return actionData.values;
}

function isPriceActionValues(
  values: ActionData["values"] | undefined,
): values is PriceActionValues {
  return (
    values !== undefined &&
    "groupType" in values &&
    "amount" in values &&
    "paymentDeadline" in values &&
    "name" in values &&
    "isSpecialPrice" in values &&
    "scheduleId" in values
  );
}

function getPriceScopeLabel(price: PriceListItem) {
  return price.schedule ? "Precio por cronograma" : "Precio base";
}

function formatPaymentDeadlineForDisplay(paymentDeadline: string | null) {
  if (!paymentDeadline) {
    return "";
  }

  return priceDateFormatter.format(new Date(`${paymentDeadline}T00:00:00Z`));
}

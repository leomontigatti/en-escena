import { z } from "zod";

import type {
  ActionData,
  PriceActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import type { PriceListItem } from "@/lib/events/bases.server";
import { groupTypeLabels } from "@/lib/events/group-types";
import { requiredFieldMessage } from "@/lib/shared/forms";

export const EMPTY_SCHEDULE_VALUE = "__empty_schedule__";

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
    paymentDeadline: z.string().trim().min(1, requiredFieldMessage),
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
    : `${groupTypeLabel} - ${scopeLabel}`;
}

export function getPriceName(price: PriceListItem) {
  return price.name ?? getPriceDisplayName(price);
}

export function formatPaymentDeadlineForTable(paymentDeadline: string | null) {
  if (!paymentDeadline) {
    return "";
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

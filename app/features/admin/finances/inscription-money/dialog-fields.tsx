/**
 * The fields of the inscription money dialog's two typed shapes, and the form
 * values they bind to: the price picker of the allocation, and the amount both
 * shapes take.
 */

import type { Control, FieldValues, Path } from "react-hook-form";
import type { z } from "zod";

import { IntegerInputField } from "@/components/shared/integer-input-field";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { formatAmount } from "@/lib/finances/formatters";

import {
  formatDialogPrice,
  type buildAllocationFormSchema,
  type buildRemovalFormSchema,
  type InscriptionRow,
  type PriceOption,
} from "./figures";

export type AllocationFormValues = z.input<
  ReturnType<typeof buildAllocationFormSchema>
>;

export type RemovalFormValues = z.input<
  ReturnType<typeof buildRemovalFormSchema>
>;

/**
 * The price control of the allocation shape, which is a picker or a readout and
 * never both. Locked, it says exactly what the picker it replaces said — name,
 * amount and `Seña`, through the one formatter — so crossing the threshold
 * cannot quietly drop a figure the administrator was choosing by.
 */
export function AllocationPriceField({
  control,
  effectivePrice,
  isLocked,
  isSaving,
  priceOptions,
}: {
  control: Control<AllocationFormValues>;
  effectivePrice: InscriptionRow["effectivePrice"];
  isLocked: boolean;
  isSaving: boolean;
  priceOptions: PriceOption[];
}) {
  // Locked, the price posts nothing — the post is the form element, and the
  // readout is no field of it — which the writer reads as keeping the row.
  if (isLocked) {
    return (
      <ReadOnlyField label="Precio" value={formatDialogPrice(effectivePrice)} />
    );
  }

  return (
    <SelectField
      control={control}
      disabled={isSaving}
      id="inscription-price"
      label="Precio"
      name="priceId"
      options={priceOptions.map((price) => ({
        label: formatDialogPrice(price),
        value: price.id,
      }))}
      placeholder="Elegí un precio"
    />
  );
}

/**
 * The amount field of the two shapes that take one. Allocating and removing are
 * typed the same way on purpose — a placeholder and never a prefilled value, and
 * the range said under the field rather than as an alert — so they share the
 * control instead of agreeing twice.
 *
 * The range is the form schema's (`buildMoneyAmountSchema`). Its ceiling is
 * unknown only on an inscription with no applicable price: there is no range to
 * name, so nothing is said and the server's refusal is what catches it.
 */
export function MoneyAmountField<TFieldValues extends FieldValues>({
  control,
  id,
  isSaving,
  name,
  placeholderAmount,
}: {
  control: Control<TFieldValues>;
  id: string;
  isSaving: boolean;
  name: Path<TFieldValues>;
  placeholderAmount: number | null;
}) {
  return (
    <IntegerInputField
      autoComplete="off"
      autoFocus
      control={control}
      disabled={isSaving}
      id={id}
      inputClassName="tabular-nums"
      label="Monto"
      name={name}
      placeholder={
        placeholderAmount === null ? undefined : formatAmount(placeholderAmount)
      }
    />
  );
}

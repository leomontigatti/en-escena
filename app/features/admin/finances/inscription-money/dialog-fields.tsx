/**
 * The fields of the inscription money dialog's two typed shapes, and the form
 * values they bind to: the price picker of the allocation, and the amount both
 * shapes take.
 */

import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import type { z } from "zod";

import { SharedFieldLayout } from "@/components/shared/field-layout";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/lib/finances/formatters";

import {
  formatDialogPrice,
  type buildAllocationFormSchema,
  type InscriptionRow,
  type PriceOption,
} from "./figures";

export type AllocationFormValues = z.input<
  ReturnType<typeof buildAllocationFormSchema>
>;

export type RemovalFormValues = { amount: string };

/**
 * The amount is validated as it is typed, against the documented
 * validate-on-submit rule (style guide § React Hook Form): the submit stays
 * disabled while the amount is out of range, so the field has to say why at
 * once, and an amount out of range is never a half-typed one — the ceiling is
 * a figure the dialog already names.
 */
export const moneyFormValidationMode = "onChange";

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
 * `maxAmount` is `null` only where the ceiling is unknown, which is an
 * inscription with no applicable price: there is no range to name, so nothing is
 * said and the server's refusal is what catches it.
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
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SharedFieldLayout
          error={fieldState.error?.message || undefined}
          id={id}
          label="Monto"
        >
          {({ describedBy, isInvalid }) => (
            <Input
              {...field}
              id={id}
              inputMode="numeric"
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={isInvalid}
              autoFocus
              className="tabular-nums"
              disabled={isSaving}
              placeholder={
                placeholderAmount === null
                  ? undefined
                  : formatAmount(placeholderAmount)
              }
              onChange={(event) =>
                field.onChange(event.target.value.replace(/\D/g, ""))
              }
            />
          )}
        </SharedFieldLayout>
      )}
    />
  );
}

import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import type { PriceGuard } from "@/lib/prices/guards";

import { openEndedDeadlineLabel } from "./view-shared";

/**
 * The structural fields read the same way on the choreography and the seminar
 * price form: the editable control while the guard allows the change, the
 * shared read-only look otherwise, with the value still travelling in the body
 * so a save of the fields that are open does not blank the ones that are
 * locked. The only difference between the two forms is the values type, so
 * these are generic over them.
 */
type GuardedFieldProps<TFieldValues extends FieldValues> = {
  fieldId: string;
  form: UseFormReturn<TFieldValues>;
  guard: PriceGuard;
  name: Path<TFieldValues>;
  value: string;
};

function GuardedAmountField<TFieldValues extends FieldValues>({
  fieldId,
  form,
  guard,
  name,
  value,
}: GuardedFieldProps<TFieldValues>) {
  if (!guard.canEditAmount) {
    return (
      <ReadOnlyField id={fieldId} label="Monto" name={name} value={value} />
    );
  }

  return (
    <IntegerInputField
      control={form.control}
      label="Monto"
      min="1"
      name={name}
      step="1"
    />
  );
}

/**
 * The deadline reads the guard like its siblings, and one thing more: what an
 * empty control means. On a new row it is a field still to fill in, on a saved
 * one it is the answer the row already gives — no deadline.
 */
function GuardedDeadlineField<TFieldValues extends FieldValues>({
  fieldId,
  form,
  guard,
  isExistingRow,
  name,
  value,
}: GuardedFieldProps<TFieldValues> & { isExistingRow: boolean }) {
  if (!guard.canEditStructure) {
    return (
      <ReadOnlyDateField
        id={fieldId}
        label="Fecha límite de pago"
        name={name}
        emptyLabel={openEndedDeadlineLabel}
        value={value || null}
      />
    );
  }

  return (
    <DateOnlyField
      clearable
      control={form.control}
      name={name}
      id={fieldId}
      label="Fecha límite de pago"
      placeholder={isExistingRow ? openEndedDeadlineLabel : undefined}
    />
  );
}

function GuardedSelectField<TFieldValues extends FieldValues>({
  fieldId,
  form,
  guard,
  label,
  name,
  options,
  placeholder,
  value,
}: GuardedFieldProps<TFieldValues> & {
  label: string;
  options: readonly { value: string; label: string }[];
  placeholder: string;
}) {
  if (!guard.canEditStructure) {
    return (
      <ReadOnlySelectField
        id={fieldId}
        label={label}
        name={name}
        options={options}
        value={value}
      />
    );
  }

  return (
    <SelectField
      control={form.control}
      label={label}
      name={name}
      options={options}
      placeholder={placeholder}
    />
  );
}

export { GuardedAmountField, GuardedDeadlineField, GuardedSelectField };

import { ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

import { FilterValueCombobox } from "./filter-value-combobox";
import {
  getAppliedFilters,
  setFilterValue,
  type FilterFieldDefinition,
  type FilterValues,
} from "./filter-schema";

/**
 * Prototype A — one chip per field, each opening only its own options.
 *
 * The height of what opens is bounded by the largest single field instead of by
 * the sum of every field, which is what the current control renders. Adding the
 * day filter costs one chip of horizontal space and no vertical growth at all.
 *
 * The applied value is on the chip face, so which filters are active is readable
 * without opening anything — today that lives only in the trigger's `aria-label`
 * and a tooltip, behind a count badge.
 */

type ChipBarPrototypeProps = {
  fields: FilterFieldDefinition[];
  values: FilterValues;
  onValuesChange: (nextValues: FilterValues) => void;
};

export function ChipBarPrototype({
  fields,
  values,
  onValuesChange,
}: ChipBarPrototypeProps) {
  const appliedFilters = getAppliedFilters(fields, values);
  const hasAppliedFilters = appliedFilters.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {fields.map((field) => (
        <FilterChip
          key={field.id}
          field={field}
          value={values[field.id] ?? null}
          onValuesChange={onValuesChange}
          values={values}
        />
      ))}
      {hasAppliedFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onValuesChange(createClearedValues(fields))}
        >
          Limpiar
        </Button>
      ) : null}
    </div>
  );
}

function FilterChip({
  field,
  value,
  values,
  onValuesChange,
}: {
  field: FilterFieldDefinition;
  value: string | null;
  values: FilterValues;
  onValuesChange: (nextValues: FilterValues) => void;
}) {
  const selectedOption = field.options.find((option) => option.value === value);
  const isActive = selectedOption !== undefined;

  return (
    <div
      className={cn(
        "flex items-center rounded-md border",
        isActive && "border-primary/40 bg-primary/5",
      )}
    >
      <FilterValueCombobox
        field={field}
        value={value}
        onValueChange={(nextValue) => {
          onValuesChange(setFilterValue(values, field.id, nextValue || null));
        }}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("font-normal", isActive && "pr-1.5")}
          >
            <span className={cn(isActive && "text-muted-foreground")}>
              {field.label}
            </span>
            {selectedOption ? (
              <span className="font-medium">{selectedOption.label}</span>
            ) : (
              <ChevronDown data-icon="inline-end" />
            )}
          </Button>
        }
      />
      {isActive ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="mr-1"
          onClick={() => {
            onValuesChange(setFilterValue(values, field.id, null));
          }}
        >
          <X data-icon />
          <span className="sr-only">{`Quitar el filtro ${field.label}`}</span>
        </Button>
      ) : null}
    </div>
  );
}

function createClearedValues(fields: FilterFieldDefinition[]): FilterValues {
  return Object.fromEntries(fields.map((field) => [field.id, null]));
}

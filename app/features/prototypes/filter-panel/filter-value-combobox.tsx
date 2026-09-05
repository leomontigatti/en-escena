import type { ReactElement } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";

import type { FilterFieldDefinition } from "./filter-schema";

/**
 * Above this many options a list stops being scannable and starts being a
 * scroll. `Categoría` is the field that crosses it, and it is the reason the
 * current single dropdown grows without bound.
 */
const searchableOptionThreshold = 8;

type FilterValueComboboxProps = {
  field: FilterFieldDefinition;
  value: string | null;
  onValueChange: (nextValue: string) => void;
  trigger: ReactElement;
};

export function FilterValueCombobox({
  field,
  value,
  onValueChange,
  trigger,
}: FilterValueComboboxProps) {
  const optionValues = field.options.map((option) => option.value);
  const labelByValue = new Map(
    field.options.map((option) => [option.value, option.label] as const),
  );
  const isSearchable = field.options.length > searchableOptionThreshold;

  function getOptionLabel(optionValue: string) {
    return labelByValue.get(optionValue) ?? optionValue;
  }

  return (
    <Combobox
      items={optionValues}
      itemToStringLabel={getOptionLabel}
      itemToStringValue={getOptionLabel}
      value={value ?? ""}
      onValueChange={(nextValue) => {
        onValueChange(typeof nextValue === "string" ? nextValue : "");
      }}
    >
      <ComboboxTrigger render={trigger} showChevron={false} />
      <ComboboxContent className="w-56">
        {isSearchable ? (
          <ComboboxInput
            placeholder={`Buscar ${field.label.toLocaleLowerCase("es-AR")}`}
            showTrigger={false}
          />
        ) : null}
        <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
        <ComboboxList className="max-h-64">
          {(optionValue: string) => (
            <ComboboxItem key={optionValue} value={optionValue}>
              {getOptionLabel(optionValue)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

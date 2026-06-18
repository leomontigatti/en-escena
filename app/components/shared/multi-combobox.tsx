import type { ReactNode } from "react";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { cn } from "@/lib/shared/utils";

export type MultiComboboxOption = {
  value: string;
  label: string;
};

type MultiComboboxProps<TOption extends MultiComboboxOption> = {
  allSelectedMessage?: string;
  className?: string;
  disabled?: boolean;
  emptyMessage?: string;
  error?: boolean;
  hideSelectedOptions?: boolean;
  name?: string;
  onBlur?: () => void;
  onValueChange: (value: string[]) => void;
  options: TOption[];
  placeholder: string;
  renderChip?: (option: TOption) => ReactNode;
  renderOption?: (option: TOption) => ReactNode;
  searchable?: boolean;
  value: string[];
};

const defaultAllSelectedMessage = "Ya seleccionaste todas las opciones.";
const defaultEmptyMessage = "Sin opciones disponibles";

function MultiCombobox<TOption extends MultiComboboxOption>({
  allSelectedMessage = defaultAllSelectedMessage,
  className,
  disabled = false,
  emptyMessage = defaultEmptyMessage,
  error = false,
  hideSelectedOptions = true,
  name,
  onBlur,
  onValueChange,
  options,
  placeholder,
  renderChip,
  renderOption,
  searchable = false,
  value,
}: MultiComboboxProps<TOption>) {
  const anchorRef = useComboboxAnchor();
  const optionByValue = new Map(
    options.map((option) => [option.value, option] as const),
  );
  const selectedValueSet = new Set(value);
  const listOptions = hideSelectedOptions
    ? options.filter((option) => !selectedValueSet.has(option.value))
    : options;
  const comboboxItems = listOptions.map((option) => option.value);
  const currentEmptyMessage =
    options.length === 0
      ? emptyMessage
      : listOptions.length === 0
        ? allSelectedMessage
        : "Sin resultados.";

  function getOption(value: string) {
    return optionByValue.get(value) ?? ({ value, label: value } as TOption);
  }

  function getOptionLabel(value: string) {
    return getOption(value).label;
  }

  return (
    <>
      {name
        ? value.map((selectedValue) => (
            <input
              key={selectedValue}
              type="hidden"
              name={name}
              value={selectedValue}
            />
          ))
        : null}
      <Combobox
        items={comboboxItems}
        itemToStringValue={getOptionLabel}
        multiple
        value={value}
        onValueChange={onValueChange}
      >
        <ComboboxChips
          ref={anchorRef}
          aria-invalid={error ? true : undefined}
          className={className}
        >
          <ComboboxValue>
            {value.map((selectedValue) => {
              const option = getOption(selectedValue);

              return (
                <ComboboxChip key={selectedValue} showRemove={!disabled}>
                  {renderChip ? renderChip(option) : option.label}
                </ComboboxChip>
              );
            })}
          </ComboboxValue>
          <ComboboxTrigger
            disabled={disabled}
            className={cn(
              "flex min-w-16 flex-1 items-center justify-between text-left text-muted-foreground outline-none",
              disabled && "pointer-events-none opacity-50",
            )}
            onBlur={onBlur}
          >
            {value.length === 0 ? (
              <span className="truncate">{placeholder}</span>
            ) : (
              <span aria-hidden="true" />
            )}
          </ComboboxTrigger>
        </ComboboxChips>
        <ComboboxContent anchor={anchorRef}>
          {searchable ? (
            <ComboboxInput
              disabled={disabled || options.length === 0}
              placeholder="Buscar"
              showTrigger={false}
            />
          ) : null}
          <ComboboxEmpty>{currentEmptyMessage}</ComboboxEmpty>
          <ComboboxList>
            {(itemValue) => {
              const option = getOption(itemValue);

              return (
                <ComboboxItem key={itemValue} value={itemValue}>
                  {renderOption ? renderOption(option) : option.label}
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </>
  );
}

export { MultiCombobox };

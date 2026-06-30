import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

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
  trailingIcon?: ReactNode;
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
  trailingIcon,
  renderChip,
  renderOption,
  searchable = false,
  value,
}: MultiComboboxProps<TOption>) {
  const anchorRef = useComboboxAnchor();
  const [isInsideDialog, setIsInsideDialog] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
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

  useEffect(() => {
    const dialogContent =
      anchorRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]') ??
      null;
    const dialogPortalHost =
      dialogContent?.querySelector<HTMLElement>(
        '[data-slot="dialog-combobox-portal-host"]',
      ) ?? null;

    setIsInsideDialog(dialogContent ? true : false);
    setPortalContainer(dialogPortalHost);
  }, [anchorRef]);

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
        disabled={disabled}
        items={comboboxItems}
        itemToStringLabel={getOptionLabel}
        itemToStringValue={getOptionLabel}
        multiple
        value={value}
        onValueChange={onValueChange}
      >
        <ComboboxChips
          ref={anchorRef}
          aria-disabled={disabled ? true : undefined}
          aria-invalid={error ? true : undefined}
          className={cn(
            disabled &&
              "cursor-default border-input/50 bg-input/25 has-data-[slot=combobox-chip]:px-2.5 dark:bg-input/40",
            "relative pr-9",
            className,
          )}
        >
          <ComboboxValue>
            {value.map((selectedValue) => {
              const option = getOption(selectedValue);

              return (
                <ComboboxChip
                  key={selectedValue}
                  className={
                    disabled ? "bg-transparent px-0 text-foreground/50" : ""
                  }
                  showRemove={!disabled}
                >
                  {renderChip ? renderChip(option) : option.label}
                </ComboboxChip>
              );
            })}
          </ComboboxValue>
          <ComboboxTrigger
            disabled={disabled}
            className={cn(
              "flex min-w-16 flex-1 items-center justify-between gap-2 text-left text-muted-foreground outline-none",
              disabled && "pointer-events-none",
            )}
            onBlur={onBlur}
            showChevron={false}
          >
            {value.length === 0 ? (
              <span className="truncate">{placeholder}</span>
            ) : (
              <span aria-hidden="true" />
            )}
          </ComboboxTrigger>
          <span className="pointer-events-none absolute top-1/2 right-3 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground">
            {trailingIcon ? (
              <span className="flex size-3 items-center justify-center [&_svg]:size-3">
                {trailingIcon}
              </span>
            ) : (
              <ChevronDownIcon aria-hidden="true" className="size-4" />
            )}
          </span>
        </ComboboxChips>
        {!disabled ? (
          <ComboboxContent
            anchor={anchorRef}
            collisionAvoidance={
              isInsideDialog
                ? {
                    side: "none",
                    align: "shift",
                    fallbackAxisSide: "none",
                  }
                : undefined
            }
            dismissableLayerBranch={isInsideDialog}
            positionerClassName={
              isInsideDialog ? "pointer-events-auto z-60" : undefined
            }
            portalContainer={portalContainer}
          >
            {searchable ? (
              <ComboboxInput
                disabled={options.length === 0}
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
        ) : null}
      </Combobox>
    </>
  );
}

export { MultiCombobox };

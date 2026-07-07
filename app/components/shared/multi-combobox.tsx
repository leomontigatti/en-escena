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
  ariaDescribedBy?: string;
  allSelectedMessage?: string;
  className?: string;
  disabled?: boolean;
  emptyMessage?: string;
  error?: boolean;
  hideSelectedOptions?: boolean;
  id?: string;
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

type MultiComboboxConfig<TOption extends MultiComboboxOption> = {
  ariaDescribedBy?: string;
  allSelectedMessage: string;
  className?: string;
  disabled: boolean;
  emptyMessage: string;
  error: boolean;
  hideSelectedOptions: boolean;
  id?: string;
  name?: string;
  onBlur?: () => void;
  onValueChange: (value: string[]) => void;
  options: TOption[];
  placeholder: string;
  trailingIcon?: ReactNode;
  renderChip?: (option: TOption) => ReactNode;
  renderOption?: (option: TOption) => ReactNode;
  searchable: boolean;
  value: string[];
};

type MultiComboboxViewModel<TOption extends MultiComboboxOption> = {
  anchorRef: ReturnType<typeof useComboboxAnchor>;
  comboboxItems: string[];
  currentEmptyMessage: string;
  getOption: (value: string) => TOption;
  getOptionLabel: (value: string) => string;
  isInsideDialog: boolean;
  listOptions: TOption[];
  portalContainer: HTMLElement | null;
};

const defaultAllSelectedMessage = "Ya seleccionaste todas las opciones.";
const defaultEmptyMessage = "Sin opciones disponibles";

function MultiCombobox<TOption extends MultiComboboxOption>(
  props: MultiComboboxProps<TOption>,
) {
  const config = getMultiComboboxConfig(props);
  const viewModel = useMultiComboboxViewModel(config);

  return (
    <>
      <MultiComboboxHiddenInputs config={config} />
      <Combobox
        disabled={config.disabled}
        items={viewModel.comboboxItems}
        itemToStringLabel={viewModel.getOptionLabel}
        itemToStringValue={viewModel.getOptionLabel}
        multiple
        value={config.value}
        onValueChange={config.onValueChange}
      >
        <MultiComboboxChipsControl config={config} viewModel={viewModel} />
        <MultiComboboxPopover config={config} viewModel={viewModel} />
      </Combobox>
    </>
  );
}

function getMultiComboboxConfig<TOption extends MultiComboboxOption>(
  props: MultiComboboxProps<TOption>,
): MultiComboboxConfig<TOption> {
  return {
    ariaDescribedBy: props.ariaDescribedBy,
    allSelectedMessage: props.allSelectedMessage ?? defaultAllSelectedMessage,
    className: props.className,
    disabled: props.disabled ?? false,
    emptyMessage: props.emptyMessage ?? defaultEmptyMessage,
    error: props.error ?? false,
    hideSelectedOptions: props.hideSelectedOptions ?? true,
    id: props.id,
    name: props.name,
    onBlur: props.onBlur,
    onValueChange: props.onValueChange,
    options: props.options,
    placeholder: props.placeholder,
    trailingIcon: props.trailingIcon,
    renderChip: props.renderChip,
    renderOption: props.renderOption,
    searchable: props.searchable ?? false,
    value: props.value,
  };
}

function useMultiComboboxViewModel<TOption extends MultiComboboxOption>(
  config: MultiComboboxConfig<TOption>,
): MultiComboboxViewModel<TOption> {
  const anchorRef = useComboboxAnchor();
  const [isInsideDialog, setIsInsideDialog] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const optionByValue = new Map(
    config.options.map((option) => [option.value, option] as const),
  );
  const listOptions = getListOptions(config);
  const comboboxItems = listOptions.map((option) => option.value);

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

  return {
    anchorRef,
    comboboxItems,
    currentEmptyMessage: getEmptyMessage(config, listOptions),
    getOption,
    getOptionLabel,
    isInsideDialog,
    listOptions,
    portalContainer,
  };
}

function getListOptions<TOption extends MultiComboboxOption>(
  config: MultiComboboxConfig<TOption>,
) {
  if (!config.hideSelectedOptions) {
    return config.options;
  }

  const selectedValueSet = new Set(config.value);

  return config.options.filter((option) => !selectedValueSet.has(option.value));
}

function getEmptyMessage<TOption extends MultiComboboxOption>(
  config: MultiComboboxConfig<TOption>,
  listOptions: TOption[],
) {
  if (config.options.length === 0) {
    return config.emptyMessage;
  }

  if (listOptions.length === 0) {
    return config.allSelectedMessage;
  }

  return "Sin resultados.";
}

function MultiComboboxHiddenInputs<TOption extends MultiComboboxOption>({
  config,
}: {
  config: MultiComboboxConfig<TOption>;
}) {
  if (!config.name) {
    return null;
  }

  return (
    <>
      {config.value.map((selectedValue) => (
        <input
          key={selectedValue}
          type="hidden"
          name={config.name}
          value={selectedValue}
        />
      ))}
    </>
  );
}

function MultiComboboxChipsControl<TOption extends MultiComboboxOption>({
  config,
  viewModel,
}: {
  config: MultiComboboxConfig<TOption>;
  viewModel: MultiComboboxViewModel<TOption>;
}) {
  return (
    <ComboboxChips
      ref={viewModel.anchorRef}
      aria-disabled={config.disabled ? true : undefined}
      aria-invalid={config.error ? true : undefined}
      className={cn(
        config.disabled &&
          "cursor-default border-input/50 bg-input/25 has-data-[slot=combobox-chip]:px-2.5 dark:bg-input/40",
        "relative pr-9",
        config.className,
      )}
    >
      <ComboboxValue>
        {config.value.map((selectedValue) => (
          <MultiComboboxChip
            key={selectedValue}
            config={config}
            option={viewModel.getOption(selectedValue)}
          />
        ))}
      </ComboboxValue>
      <MultiComboboxTrigger config={config} />
      <MultiComboboxTrailingIcon config={config} />
    </ComboboxChips>
  );
}

function MultiComboboxChip<TOption extends MultiComboboxOption>({
  config,
  option,
}: {
  config: MultiComboboxConfig<TOption>;
  option: TOption;
}) {
  return (
    <ComboboxChip
      className={
        config.disabled ? "bg-transparent px-0 text-foreground/50" : ""
      }
      showRemove={!config.disabled}
    >
      {config.renderChip ? config.renderChip(option) : option.label}
    </ComboboxChip>
  );
}

function MultiComboboxTrigger<TOption extends MultiComboboxOption>({
  config,
}: {
  config: MultiComboboxConfig<TOption>;
}) {
  return (
    <ComboboxTrigger
      id={config.id}
      aria-describedby={config.ariaDescribedBy}
      aria-invalid={config.error ? true : undefined}
      disabled={config.disabled}
      className={cn(
        "flex min-w-16 flex-1 items-center justify-between gap-2 text-left text-muted-foreground outline-none",
        config.disabled && "pointer-events-none",
      )}
      onBlur={config.onBlur}
      showChevron={false}
    >
      {config.value.length === 0 ? (
        <span className="truncate">{config.placeholder}</span>
      ) : (
        <span aria-hidden="true" />
      )}
    </ComboboxTrigger>
  );
}

function MultiComboboxTrailingIcon<TOption extends MultiComboboxOption>({
  config,
}: {
  config: MultiComboboxConfig<TOption>;
}) {
  return (
    <span className="pointer-events-none absolute top-1/2 right-3 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground">
      {config.trailingIcon ? (
        <span className="flex size-3 items-center justify-center [&_svg]:size-3">
          {config.trailingIcon}
        </span>
      ) : (
        <ChevronDownIcon aria-hidden="true" className="size-4" />
      )}
    </span>
  );
}

function MultiComboboxPopover<TOption extends MultiComboboxOption>({
  config,
  viewModel,
}: {
  config: MultiComboboxConfig<TOption>;
  viewModel: MultiComboboxViewModel<TOption>;
}) {
  if (config.disabled) {
    return null;
  }

  return (
    <ComboboxContent
      anchor={viewModel.anchorRef}
      collisionAvoidance={getDialogCollisionAvoidance(viewModel)}
      dismissableLayerBranch={viewModel.isInsideDialog}
      positionerClassName={
        viewModel.isInsideDialog ? "pointer-events-auto z-60" : undefined
      }
      portalContainer={viewModel.portalContainer}
    >
      {config.searchable ? (
        <ComboboxInput
          disabled={config.options.length === 0}
          placeholder="Buscar"
          showTrigger={false}
        />
      ) : null}
      <ComboboxEmpty>{viewModel.currentEmptyMessage}</ComboboxEmpty>
      <ComboboxList>
        {(itemValue) => (
          <MultiComboboxItem
            config={config}
            itemValue={itemValue}
            option={viewModel.getOption(itemValue)}
          />
        )}
      </ComboboxList>
    </ComboboxContent>
  );
}

function getDialogCollisionAvoidance<TOption extends MultiComboboxOption>(
  viewModel: MultiComboboxViewModel<TOption>,
) {
  if (!viewModel.isInsideDialog) {
    return undefined;
  }

  return {
    side: "none",
    align: "shift",
    fallbackAxisSide: "none",
  } as const;
}

function MultiComboboxItem<TOption extends MultiComboboxOption>({
  config,
  itemValue,
  option,
}: {
  config: MultiComboboxConfig<TOption>;
  itemValue: string;
  option: TOption;
}) {
  return (
    <ComboboxItem key={itemValue} value={itemValue}>
      {config.renderOption ? config.renderOption(option) : option.label}
    </ComboboxItem>
  );
}

export { MultiCombobox };

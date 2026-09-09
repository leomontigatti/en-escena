import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  SharedFieldLayout,
  type SharedFieldOrientation,
} from "@/components/shared/field-layout";

// A combobox popup lives in a portal, so inside a dialog it is an outside
// press by default: clicking an option dismisses the dialog, and the layer
// above blocks pointer events on the search input. `MultiCombobox` solves
// this by portalling into the host `DialogContent` renders for exactly this
// purpose; a single-select combobox needs the same treatment.
const dialogCollisionAvoidance = {
  side: "none",
  align: "shift",
  fallbackAxisSide: "none",
} as const;

function useComboboxDialogHost(anchorRef: RefObject<HTMLDivElement | null>) {
  const [isInsideDialog, setIsInsideDialog] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );

  useEffect(() => {
    const dialogContent =
      anchorRef.current?.closest<HTMLElement>('[data-slot="dialog-content"]') ??
      null;

    setIsInsideDialog(dialogContent ? true : false);
    setPortalContainer(
      dialogContent?.querySelector<HTMLElement>(
        '[data-slot="dialog-combobox-portal-host"]',
      ) ?? null,
    );
  }, [anchorRef]);

  return { isInsideDialog, portalContainer };
}

type ComboboxFieldOption = {
  value: string;
  label: string;
};

type ComboboxFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TOption extends ComboboxFieldOption,
> = {
  className?: string;
  contentClassName?: string;
  contentProps?: Omit<ComponentProps<typeof ComboboxContent>, "anchor">;
  control: Control<TFieldValues>;
  description?: ReactNode;
  emptyMessage?: ReactNode;
  errorClassName?: string;
  id?: string;
  inputPlaceholder?: string;
  label: ReactNode;
  labelClassName?: string;
  name: TName;
  options: readonly TOption[];
  orientation?: SharedFieldOrientation;
  placeholder?: string;
  popupClassName?: string;
};

function ComboboxField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TOption extends ComboboxFieldOption,
>(props: ComboboxFieldProps<TFieldValues, TName, TOption>) {
  const { control: comboboxConfig, layout } = useComboboxFieldConfig(props);

  return (
    <Controller
      control={props.control}
      name={props.name}
      render={({ field, fieldState }) => (
        <SharedFieldLayout {...layout} error={fieldState.error?.message}>
          {({ describedBy, isInvalid }) => (
            <ComboboxFieldControl
              config={comboboxConfig}
              describedBy={describedBy}
              field={field}
              isInvalid={isInvalid}
            />
          )}
        </SharedFieldLayout>
      )}
    />
  );
}

// Splits the props into what the shared layout renders and what the combobox
// itself needs, and owns the defaults.
function useComboboxFieldConfig<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TOption extends ComboboxFieldOption,
>(props: ComboboxFieldProps<TFieldValues, TName, TOption>) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const anchorRef = useComboboxAnchor();
  const dialogHost = useComboboxDialogHost(anchorRef);
  const optionByValue = new Map(
    props.options.map((option) => [option.value, option] as const),
  );

  function getOptionLabel(value: string) {
    return optionByValue.get(value)?.label ?? value;
  }

  return {
    layout: {
      className: props.className,
      contentClassName: props.contentClassName,
      description: props.description,
      errorClassName: props.errorClassName,
      id,
      label: props.label,
      labelClassName: props.labelClassName,
      orientation: props.orientation,
    },
    control: {
      anchorRef,
      contentProps: props.contentProps,
      emptyMessage: props.emptyMessage ?? "Sin resultados.",
      getOptionLabel,
      id,
      inputPlaceholder: props.inputPlaceholder ?? "Buscar",
      isInsideDialog: dialogHost.isInsideDialog,
      optionValues: props.options.map((option) => option.value),
      placeholder: props.placeholder ?? "Seleccionar",
      popupClassName: props.popupClassName,
      portalContainer: dialogHost.portalContainer,
    },
  };
}

type ComboboxFieldControlConfig = {
  anchorRef: RefObject<HTMLDivElement | null>;
  contentProps?: Omit<ComponentProps<typeof ComboboxContent>, "anchor">;
  emptyMessage: ReactNode;
  getOptionLabel: (value: string) => string;
  id: string;
  inputPlaceholder: string;
  isInsideDialog: boolean;
  optionValues: string[];
  placeholder: string;
  popupClassName?: string;
  portalContainer: HTMLElement | null;
};

function ComboboxFieldControl({
  config,
  describedBy,
  field,
  isInvalid,
}: {
  config: ComboboxFieldControlConfig;
  describedBy?: string;
  // Structurally what `Controller` hands back, without dragging the form's
  // generics through every child.
  field: {
    name: string;
    value: unknown;
    onBlur: () => void;
    onChange: (...event: unknown[]) => void;
  };
  isInvalid: boolean;
}) {
  const value = typeof field.value === "string" ? field.value : "";

  return (
    <>
      <input type="hidden" name={field.name} value={value} />
      <Combobox
        items={config.optionValues}
        itemToStringLabel={config.getOptionLabel}
        itemToStringValue={config.getOptionLabel}
        value={value}
        defaultValue={value}
        onValueChange={field.onChange}
      >
        <ComboboxFieldTrigger
          anchorRef={config.anchorRef}
          describedBy={describedBy}
          isInvalid={isInvalid}
          placeholder={config.placeholder}
          value={value}
        />
        <ComboboxFieldPopup
          anchorRef={config.anchorRef}
          className={config.popupClassName}
          contentProps={config.contentProps}
          emptyMessage={config.emptyMessage}
          getOptionLabel={config.getOptionLabel}
          id={config.id}
          inputPlaceholder={config.inputPlaceholder}
          isInsideDialog={config.isInsideDialog}
          isInvalid={isInvalid}
          onBlur={field.onBlur}
          portalContainer={config.portalContainer}
        />
      </Combobox>
    </>
  );
}

function ComboboxFieldTrigger({
  anchorRef,
  describedBy,
  isInvalid,
  placeholder,
  value,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  describedBy?: string;
  isInvalid: boolean;
  placeholder: string;
  value: string;
}) {
  return (
    // The anchor has to be a real element: the popup positions against it, and
    // inside a dialog it is also what locates the dialog's portal host.
    <div ref={anchorRef}>
      <ComboboxTrigger
        render={
          <Button
            variant="outline"
            // A field, not a button: it keeps the arrow cursor, does not react
            // to hover, and takes the brand ring on focus, like the control
            // `MultiCombobox` builds out of `ComboboxChips`.
            className="w-full cursor-default justify-between border-input font-normal hover:bg-background hover:text-foreground aria-expanded:bg-background aria-expanded:text-foreground focus-visible:border-brand focus-visible:ring-brand/50 dark:hover:bg-input/30 dark:aria-expanded:bg-input/30"
            aria-describedby={describedBy || undefined}
            aria-invalid={isInvalid ? true : undefined}
          >
            {value ? <ComboboxValue /> : placeholder}
            <ChevronDownIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
          </Button>
        }
      />
    </div>
  );
}

function ComboboxFieldPopup({
  anchorRef,
  className,
  contentProps,
  emptyMessage,
  getOptionLabel,
  id,
  inputPlaceholder,
  isInsideDialog,
  isInvalid,
  onBlur,
  portalContainer,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  className?: string;
  contentProps?: Omit<ComponentProps<typeof ComboboxContent>, "anchor">;
  emptyMessage: ReactNode;
  getOptionLabel: (value: string) => string;
  id: string;
  inputPlaceholder: string;
  isInsideDialog: boolean;
  isInvalid: boolean;
  onBlur: () => void;
  portalContainer: HTMLElement | null;
}) {
  return (
    <ComboboxContent
      anchor={anchorRef}
      className={className}
      collisionAvoidance={isInsideDialog ? dialogCollisionAvoidance : undefined}
      dismissableLayerBranch={isInsideDialog}
      positionerClassName={
        isInsideDialog ? "pointer-events-auto z-60" : undefined
      }
      portalContainer={portalContainer}
      {...contentProps}
    >
      <ComboboxInput
        id={id}
        aria-invalid={isInvalid ? true : undefined}
        placeholder={inputPlaceholder}
        showTrigger={false}
        onBlur={onBlur}
      />
      <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
      <ComboboxList>
        {(optionValue) => (
          <ComboboxItem key={optionValue} value={optionValue}>
            {getOptionLabel(optionValue)}
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  );
}

export { ComboboxField, type ComboboxFieldOption };

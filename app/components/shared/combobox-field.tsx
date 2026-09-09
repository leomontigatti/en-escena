import {
  useId,
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
import { useComboboxDialogPortal } from "@/components/shared/combobox-dialog-portal";
import {
  SharedFieldLayout,
  type SharedFieldOrientation,
} from "@/components/shared/field-layout";

type ComboboxFieldOption = {
  value: string;
  label: string;
};

type ComboboxFieldControlProps<TOption extends ComboboxFieldOption> = {
  contentProps?: Omit<ComponentProps<typeof ComboboxContent>, "anchor">;
  emptyMessage?: ReactNode;
  inputPlaceholder?: string;
  options: TOption[];
  placeholder?: string;
  popupClassName?: string;
};

type ComboboxFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TOption extends ComboboxFieldOption,
> = ComboboxFieldControlProps<TOption> & {
  className?: string;
  contentClassName?: string;
  control: Control<TFieldValues>;
  description?: ReactNode;
  errorClassName?: string;
  id?: string;
  label: ReactNode;
  labelClassName?: string;
  name: TName;
  orientation?: SharedFieldOrientation;
};

// Wires the form field and the shared layout; the combobox itself lives in
// `ComboboxFieldControl`.
function ComboboxField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TOption extends ComboboxFieldOption,
>({
  className,
  contentClassName,
  control,
  description,
  errorClassName,
  id: providedId,
  label,
  labelClassName,
  name,
  orientation,
  ...controlProps
}: ComboboxFieldProps<TFieldValues, TName, TOption>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SharedFieldLayout
          className={className}
          contentClassName={contentClassName}
          description={description}
          error={fieldState.error?.message}
          errorClassName={errorClassName}
          id={id}
          label={label}
          labelClassName={labelClassName}
          orientation={orientation}
        >
          {({ describedBy, isInvalid }) => (
            <ComboboxFieldControl
              {...controlProps}
              describedBy={describedBy}
              field={field}
              id={id}
              isInvalid={isInvalid}
            />
          )}
        </SharedFieldLayout>
      )}
    />
  );
}

function ComboboxFieldControl<TOption extends ComboboxFieldOption>({
  contentProps,
  describedBy,
  emptyMessage = "Sin resultados.",
  field,
  id,
  inputPlaceholder = "Buscar",
  isInvalid,
  options,
  placeholder = "Seleccionar",
  popupClassName,
}: ComboboxFieldControlProps<TOption> & {
  describedBy?: string;
  // Structurally what `Controller` hands back, without dragging the form's
  // generics through the control.
  field: {
    name: string;
    value: unknown;
    onBlur: () => void;
    onChange: (...event: unknown[]) => void;
  };
  id: string;
  isInvalid: boolean;
}) {
  const anchorRef = useComboboxAnchor();
  const dialogPortal = useComboboxDialogPortal(anchorRef);
  const optionByValue = new Map(
    options.map((option) => [option.value, option] as const),
  );
  const optionValues = options.map((option) => option.value);
  const value = typeof field.value === "string" ? field.value : "";

  function getOptionLabel(optionValue: string) {
    return optionByValue.get(optionValue)?.label ?? optionValue;
  }

  return (
    <>
      <input type="hidden" name={field.name} value={value} />
      <Combobox
        items={optionValues}
        itemToStringLabel={getOptionLabel}
        itemToStringValue={getOptionLabel}
        value={value}
        defaultValue={value}
        onValueChange={field.onChange}
      >
        <ComboboxFieldTrigger
          anchorRef={anchorRef}
          describedBy={describedBy}
          isInvalid={isInvalid}
          placeholder={placeholder}
          value={value}
        />
        <ComboboxContent
          anchor={anchorRef}
          className={popupClassName}
          {...dialogPortal}
          {...contentProps}
        >
          <ComboboxInput
            id={id}
            aria-invalid={isInvalid ? true : undefined}
            placeholder={inputPlaceholder}
            showTrigger={false}
            onBlur={field.onBlur}
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
              data-icon="inline-end"
              className="text-muted-foreground"
            />
          </Button>
        }
      />
    </div>
  );
}

export { ComboboxField, type ComboboxFieldOption };

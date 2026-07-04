import { useId, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

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
>({
  className,
  contentClassName,
  contentProps,
  control,
  description,
  emptyMessage = "Sin resultados.",
  errorClassName,
  id: providedId,
  inputPlaceholder = "Buscar",
  label,
  labelClassName,
  name,
  options,
  orientation,
  placeholder = "Seleccionar",
  popupClassName,
}: ComboboxFieldProps<TFieldValues, TName, TOption>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const anchorRef = useComboboxAnchor();
  const optionByValue = new Map(
    options.map((option) => [option.value, option] as const),
  );
  const optionValues = options.map((option) => option.value);

  function getOptionLabel(value: string) {
    return optionByValue.get(value)?.label ?? value;
  }

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldValue = typeof field.value === "string" ? field.value : "";
        const errorMessage = fieldState.error?.message;

        return (
          <SharedFieldLayout
            className={className}
            contentClassName={contentClassName}
            description={description}
            error={errorMessage}
            errorClassName={errorClassName}
            id={id}
            label={label}
            labelClassName={labelClassName}
            orientation={orientation}
          >
            {({ describedBy, isInvalid }) => (
              <>
                <input type="hidden" name={field.name} value={fieldValue} />
                <Combobox
                  items={optionValues}
                  itemToStringLabel={getOptionLabel}
                  itemToStringValue={getOptionLabel}
                  value={fieldValue}
                  defaultValue={fieldValue}
                  onValueChange={field.onChange}
                >
                  <ComboboxTrigger
                    render={
                      <Button
                        variant="outline"
                        className="w-full justify-between font-normal"
                        aria-describedby={describedBy || undefined}
                        aria-invalid={isInvalid ? true : undefined}
                      >
                        {fieldValue ? <ComboboxValue /> : placeholder}
                      </Button>
                    }
                  />
                  <ComboboxContent
                    anchor={anchorRef}
                    className={popupClassName}
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
            )}
          </SharedFieldLayout>
        );
      }}
    />
  );
}

export { ComboboxField, type ComboboxFieldOption };

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
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

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
  orientation?: ComponentProps<typeof Field>["orientation"];
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
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = `${id}-error`;
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
        const isInvalid = Boolean(errorMessage);
        const describedBy = [descriptionId, isInvalid ? errorId : undefined]
          .filter(Boolean)
          .join(" ");

        return (
          <Field
            className={className}
            data-invalid={isInvalid ? true : undefined}
            orientation={orientation}
          >
            <FieldLabel htmlFor={id} className={labelClassName}>
              {label}
            </FieldLabel>
            <FieldContent className={contentClassName}>
              {description ? (
                <FieldDescription id={descriptionId}>
                  {description}
                </FieldDescription>
              ) : null}
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
              <FieldError id={errorId} className={errorClassName}>
                {errorMessage}
              </FieldError>
            </FieldContent>
          </Field>
        );
      }}
    />
  );
}

export { ComboboxField, type ComboboxFieldOption };

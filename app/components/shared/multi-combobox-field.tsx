import type { ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import {
  MultiCombobox,
  type MultiComboboxOption,
} from "@/components/shared/multi-combobox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

type MultiComboboxFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TOption extends MultiComboboxOption,
> = {
  allSelectedMessage?: string;
  className?: string;
  control: Control<TFieldValues>;
  disabled?: boolean;
  emptyMessage?: string;
  inputName?: string;
  label: string;
  name: TName;
  onValueChange?: () => void;
  options: TOption[];
  placeholder: string;
  searchable?: boolean;
  trailingIcon?: ReactNode;
};

function MultiComboboxField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TOption extends MultiComboboxOption,
>({
  allSelectedMessage,
  className,
  control,
  disabled = false,
  emptyMessage,
  inputName,
  label,
  name,
  onValueChange,
  options,
  placeholder,
  searchable,
  trailingIcon,
}: MultiComboboxFieldProps<TFieldValues, TName, TOption>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const currentValue = Array.isArray(field.value) ? field.value : [];
        const isInvalid = fieldState.error ? true : false;

        return (
          <Field
            className={className}
            data-disabled={disabled ? true : undefined}
            data-invalid={isInvalid ? true : undefined}
          >
            <FieldLabel>{label}</FieldLabel>
            <FieldContent>
              <MultiCombobox
                allSelectedMessage={allSelectedMessage}
                disabled={disabled}
                emptyMessage={emptyMessage}
                error={isInvalid}
                name={inputName}
                onBlur={field.onBlur}
                onValueChange={(nextValue) => {
                  field.onChange(nextValue);
                  onValueChange?.();
                }}
                options={options}
                placeholder={placeholder}
                searchable={searchable}
                trailingIcon={trailingIcon}
                value={currentValue}
              />
              {fieldState.error?.message ? (
                <FieldError>{fieldState.error.message}</FieldError>
              ) : null}
            </FieldContent>
          </Field>
        );
      }}
    />
  );
}

export { MultiComboboxField };

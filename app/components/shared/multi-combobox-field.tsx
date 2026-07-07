import { useId, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { FieldLockIcon } from "@/components/shared/field-lock-icon";
import {
  SharedFieldLayout,
  type SharedFieldOrientation,
} from "@/components/shared/field-layout";
import {
  MultiCombobox,
  type MultiComboboxOption,
} from "@/components/shared/multi-combobox";

type MultiComboboxFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TOption extends MultiComboboxOption,
> = {
  allSelectedMessage?: string;
  className?: string;
  contentClassName?: string;
  control: Control<TFieldValues>;
  description?: ReactNode;
  disabled?: boolean;
  emptyMessage?: string;
  errorClassName?: string;
  id?: string;
  inputName?: string;
  label: ReactNode;
  labelClassName?: string;
  name: TName;
  onValueChange?: () => void;
  options: TOption[];
  orientation?: SharedFieldOrientation;
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
  contentClassName,
  control,
  description,
  disabled = false,
  emptyMessage,
  errorClassName,
  id: providedId,
  inputName,
  label,
  labelClassName,
  name,
  onValueChange,
  options,
  orientation,
  placeholder,
  searchable,
  trailingIcon,
}: MultiComboboxFieldProps<TFieldValues, TName, TOption>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const currentValue = Array.isArray(field.value) ? field.value : [];
        const errorMessage = fieldState.error?.message;

        return (
          <SharedFieldLayout
            className={className}
            contentClassName={contentClassName}
            description={description}
            disabled={disabled}
            error={errorMessage}
            errorClassName={errorClassName}
            id={id}
            label={label}
            labelClassName={labelClassName}
            orientation={orientation}
          >
            {({ describedBy, isInvalid }) => (
              <MultiCombobox
                id={id}
                ariaDescribedBy={describedBy || undefined}
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
                trailingIcon={
                  disabled ? (trailingIcon ?? <FieldLockIcon />) : trailingIcon
                }
                value={currentValue}
              />
            )}
          </SharedFieldLayout>
        );
      }}
    />
  );
}

export { MultiComboboxField };

import { useId, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { FieldControlLockIcon } from "@/components/shared/field-lock-icon";
import {
  SharedFieldLayout,
  type SharedFieldOrientation,
} from "@/components/shared/field-layout";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";

type SelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = Omit<
  ComponentProps<typeof Select>,
  | "aria-describedby"
  | "aria-invalid"
  | "className"
  | "defaultValue"
  | "id"
  | "name"
  | "onBlur"
  | "onChange"
  | "value"
  | "placeholder"
  | "options"
> & {
  allowEmpty?: boolean;
  className?: string;
  contentProps?: Omit<ComponentProps<typeof SelectContent>, "children">;
  contentClassName?: string;
  control: Control<TFieldValues>;
  description?: ReactNode;
  errorClassName?: string;
  id?: string;
  inputClassName?: string;
  label: ReactNode;
  labelClassName?: string;
  name: TName;
  orientation?: SharedFieldOrientation;
  placeholder?: string;
  emptyLabel?: string;
  options: readonly { value: string; label: string }[];
};

const emptySelectValue = "__empty-select-field-value__";

function SelectField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  allowEmpty = false,
  contentClassName,
  className,
  contentProps,
  control,
  description,
  errorClassName,
  id: providedId,
  inputClassName = "w-full",
  label,
  labelClassName,
  name,
  orientation,
  disabled = false,
  emptyLabel,
  onValueChange,
  placeholder,
  options,
}: SelectFieldProps<TFieldValues, TName>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const displayedOptions = allowEmpty
    ? [
        {
          value: emptySelectValue,
          label: emptyLabel ?? placeholder ?? "Sin selección",
        },
        ...options,
      ]
    : options;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldValue = typeof field.value === "string" ? field.value : "";
        const selectValue =
          allowEmpty && fieldValue === "" ? emptySelectValue : fieldValue;
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
              <>
                <input type="hidden" name={field.name} value={fieldValue} />
                <div className="relative">
                  <Select
                    disabled={disabled}
                    value={selectValue}
                    onValueChange={(value) => {
                      const nextValue =
                        allowEmpty && value === emptySelectValue ? "" : value;
                      field.onChange(nextValue);
                      onValueChange?.(nextValue);
                    }}
                  >
                    <SelectTrigger
                      id={id}
                      aria-describedby={describedBy || undefined}
                      aria-invalid={isInvalid ? true : undefined}
                      className={cn(
                        inputClassName,
                        disabled && "pr-9 [&>svg]:hidden",
                      )}
                      disabled={disabled}
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder={placeholder} />
                    </SelectTrigger>
                    <SelectContent {...contentProps}>
                      <SelectGroup>
                        {displayedOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {disabled ? <FieldControlLockIcon /> : null}
                </div>
              </>
            )}
          </SharedFieldLayout>
        );
      }}
    />
  );
}

export { SelectField };

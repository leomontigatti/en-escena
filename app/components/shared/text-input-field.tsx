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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/shared/utils";

type TextInputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = Omit<
  ComponentProps<typeof Input>,
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
> & {
  className?: string;
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
};

function TextInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  contentClassName,
  className,
  control,
  description,
  errorClassName,
  id: providedId,
  inputClassName,
  label,
  labelClassName,
  name,
  orientation,
  disabled = false,
  placeholder,
  ...inputProps
}: TextInputFieldProps<TFieldValues, TName>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
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
              <div className="relative">
                <Input
                  {...inputProps}
                  {...field}
                  id={id}
                  aria-describedby={describedBy || undefined}
                  aria-invalid={isInvalid ? true : undefined}
                  className={cn(disabled && "pr-9", inputClassName)}
                  disabled={disabled}
                  placeholder={placeholder}
                />
                {disabled ? <FieldControlLockIcon /> : null}
              </div>
            )}
          </SharedFieldLayout>
        );
      }}
    />
  );
}

export { TextInputField };

import {
  useId,
  type ChangeEventHandler,
  type ComponentProps,
  type ReactNode,
} from "react";
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

type IntegerInputProps = Omit<
  ComponentProps<typeof Input>,
  "inputMode" | "onChange" | "pattern" | "type"
> & {
  onChange?: ChangeEventHandler<HTMLInputElement>;
};

type IntegerInputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = Omit<
  ComponentProps<typeof IntegerInput>,
  | "aria-describedby"
  | "aria-invalid"
  | "className"
  | "defaultValue"
  | "id"
  | "name"
  | "onBlur"
  | "onChange"
  | "value"
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
};

function getIntegerInputValue(value: string) {
  return value.replace(/\D/g, "");
}

function IntegerInput({ onChange, ...props }: IntegerInputProps) {
  return (
    <Input
      inputMode="numeric"
      pattern="[0-9]*"
      type="text"
      onChange={(event) => {
        event.currentTarget.value = getIntegerInputValue(
          event.currentTarget.value,
        );
        onChange?.(event);
      }}
      {...props}
    />
  );
}

function IntegerInputField<
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
  ...inputProps
}: IntegerInputFieldProps<TFieldValues, TName>) {
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
                <IntegerInput
                  {...inputProps}
                  {...field}
                  id={id}
                  aria-describedby={describedBy || undefined}
                  aria-invalid={isInvalid ? true : undefined}
                  className={cn(disabled && "pr-9", inputClassName)}
                  disabled={disabled}
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

export {
  IntegerInput,
  IntegerInputField,
  getIntegerInputValue,
  type IntegerInputFieldProps,
  type IntegerInputProps,
};

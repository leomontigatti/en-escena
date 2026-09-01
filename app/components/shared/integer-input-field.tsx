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
  /**
   * Read-only text rendered right after the typed value, inside the control.
   * It is decoration: `aria-hidden`, unselectable, and never submitted, so the
   * label still has to carry whatever it says.
   */
  suffix?: string;
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
  suffix,
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
                <IntegerInputSuffix suffix={suffix} value={field.value} />
                {disabled ? <FieldControlLockIcon /> : null}
              </div>
            )}
          </SharedFieldLayout>
        );
      }}
    />
  );
}

/**
 * The suffix has to sit right after the typed value and move with it, so it is
 * laid out over the control on top of an invisible copy of that value: same
 * font and padding as the input, so the copy is exactly as wide as the text it
 * mirrors and no measurement is needed.
 */
function IntegerInputSuffix({
  suffix,
  value,
}: {
  suffix?: string;
  value?: string;
}) {
  if (!suffix || !value) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-2.5 flex max-w-[calc(100%-1.25rem)] items-center overflow-hidden whitespace-pre text-base md:text-sm"
    >
      <span className="invisible">{value}</span>
      <span className="text-muted-foreground">{suffix}</span>
    </span>
  );
}

export {
  IntegerInput,
  IntegerInputField,
  getIntegerInputValue,
  type IntegerInputFieldProps,
  type IntegerInputProps,
};

import { DollarSign } from "lucide-react";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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

type MoneyInputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = Omit<IntegerInputFieldProps<TFieldValues, TName>, "suffix">;

function getIntegerInputValue(value: string) {
  return value.replace(/\D/g, "");
}

function getIntegerInputControlProps(
  onChange: ChangeEventHandler<HTMLInputElement> | undefined,
) {
  return {
    inputMode: "numeric",
    pattern: "[0-9]*",
    type: "text",
    onChange: (event) => {
      event.currentTarget.value = getIntegerInputValue(
        event.currentTarget.value,
      );
      onChange?.(event);
    },
  } satisfies ComponentProps<typeof Input>;
}

function IntegerInput({ onChange, ...props }: IntegerInputProps) {
  return <Input {...getIntegerInputControlProps(onChange)} {...props} />;
}

/** The same control inside an `InputGroup`, so an addon can lead it. */
function IntegerInputGroupInput({ onChange, ...props }: IntegerInputProps) {
  return (
    <InputGroupInput {...getIntegerInputControlProps(onChange)} {...props} />
  );
}

function IntegerInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(props: IntegerInputFieldProps<TFieldValues, TName>) {
  return <IntegerField {...props} />;
}

/**
 * A whole-peso amount. The dollar sign is the control's, so neither the value
 * nor the placeholder carries one: hint a figure with `formatAmountNumber`.
 */
function MoneyInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(props: MoneyInputFieldProps<TFieldValues, TName>) {
  return <IntegerField {...props} currency />;
}

function IntegerField<
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
  currency = false,
  disabled = false,
  ...inputProps
}: IntegerInputFieldProps<TFieldValues, TName> & {
  /** Leads the control with a dollar sign, the way a search box leads with its magnifier. */
  currency?: boolean;
}) {
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
            {({ describedBy, isInvalid }) => {
              const controlProps = {
                ...inputProps,
                ...field,
                id,
                "aria-describedby": describedBy || undefined,
                "aria-invalid": isInvalid ? true : undefined,
                className: cn(disabled && "pr-9", inputClassName),
                disabled,
              };
              // A disabled group dims as a whole, so its control does not dim
              // again inside it, and the lock sits outside it to read at full
              // strength as it does on every other field.
              return (
                <div className="relative">
                  {currency ? (
                    <InputGroup>
                      <InputGroupAddon>
                        <DollarSign aria-hidden="true" />
                      </InputGroupAddon>
                      <IntegerInputGroupInput
                        {...controlProps}
                        className={cn(
                          controlProps.className,
                          "disabled:opacity-100",
                        )}
                      />
                    </InputGroup>
                  ) : (
                    <>
                      <IntegerInput {...controlProps} />
                      <IntegerInputSuffix suffix={suffix} value={field.value} />
                    </>
                  )}
                  {disabled ? <FieldControlLockIcon /> : null}
                </div>
              );
            }}
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
  MoneyInputField,
  getIntegerInputValue,
  type IntegerInputFieldProps,
};

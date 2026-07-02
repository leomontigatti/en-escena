import { useId, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
  ...inputProps
}: TextInputFieldProps<TFieldValues, TName>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = `${id}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const errorMessage =
          fieldState.error?.type === "server"
            ? undefined
            : fieldState.error?.message;
        const isInvalid = Boolean(errorMessage);
        const describedBy = [descriptionId, isInvalid ? errorId : undefined]
          .filter(Boolean)
          .join(" ");

        return (
          <Field
            className={className}
            data-invalid={isInvalid ? true : undefined}
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
              <Input
                {...inputProps}
                {...field}
                id={id}
                aria-describedby={describedBy || undefined}
                aria-invalid={isInvalid ? true : undefined}
                className={inputClassName}
              />
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

export { TextInputField, type TextInputFieldProps };

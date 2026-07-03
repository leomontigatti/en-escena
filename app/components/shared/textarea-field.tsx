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
import { Textarea } from "@/components/ui/textarea";

type TextareaFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = Omit<
  ComponentProps<typeof Textarea>,
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
  orientation?: ComponentProps<typeof Field>["orientation"];
};

function TextareaField<
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
  ...textareaProps
}: TextareaFieldProps<TFieldValues, TName>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = `${id}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const errorMessage = fieldState.error?.message;
        const isInvalid = Boolean(errorMessage);
        const describedBy = [descriptionId, isInvalid ? errorId : undefined]
          .filter(Boolean)
          .join(" ");

        return (
          <Field
            className={className}
            data-disabled={disabled ? true : undefined}
            data-invalid={isInvalid ? true : undefined}
            orientation={orientation}
          >
            <FieldLabel htmlFor={id} className={labelClassName}>
              {label}
            </FieldLabel>
            <FieldContent className={contentClassName}>
              <Textarea
                {...textareaProps}
                {...field}
                id={id}
                aria-describedby={describedBy || undefined}
                aria-invalid={isInvalid ? true : undefined}
                className={inputClassName}
                disabled={disabled}
                value={typeof field.value === "string" ? field.value : ""}
              />
              {description ? (
                <FieldDescription id={descriptionId}>
                  {description}
                </FieldDescription>
              ) : null}
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

export { TextareaField };

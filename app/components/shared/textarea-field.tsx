import { useId, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import {
  SharedFieldLayout,
  type SharedFieldOrientation,
} from "@/components/shared/field-layout";
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
  orientation?: SharedFieldOrientation;
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
            descriptionPlacement="after-control"
            disabled={disabled}
            error={errorMessage}
            errorClassName={errorClassName}
            id={id}
            label={label}
            labelClassName={labelClassName}
            orientation={orientation}
          >
            {({ describedBy, isInvalid }) => (
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
            )}
          </SharedFieldLayout>
        );
      }}
    />
  );
}

export { TextareaField };

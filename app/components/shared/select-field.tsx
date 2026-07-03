import { useId, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { FieldControlLockIcon } from "@/components/shared/field-lock-icon";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

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
  orientation?: ComponentProps<typeof Field>["orientation"];
  placeholder?: string;
  options: readonly { value: string; label: string }[];
};

function SelectField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
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
  onValueChange,
  placeholder,
  options,
}: SelectFieldProps<TFieldValues, TName>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = `${id}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldValue = typeof field.value === "string" ? field.value : "";
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
              {description ? (
                <FieldDescription id={descriptionId}>
                  {description}
                </FieldDescription>
              ) : null}
              <input type="hidden" name={field.name} value={fieldValue} />
              <div className="relative">
                <Select
                  disabled={disabled}
                  value={fieldValue}
                  onValueChange={(value) => {
                    field.onChange(value);
                    onValueChange?.(value);
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
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {disabled ? <FieldControlLockIcon /> : null}
              </div>
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

export { SelectField };

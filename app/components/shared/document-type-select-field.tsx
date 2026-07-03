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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const noDocumentTypeSelectValue = "sin-documento";

const documentTypeOptions = [
  { value: noDocumentTypeSelectValue, label: "Sin documento" },
  { value: "dni", label: "DNI" },
  { value: "passport", label: "Pasaporte" },
  { value: "other", label: "Otro" },
] as const;

type DocumentTypeSelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  className?: string;
  contentClassName?: string;
  contentProps?: Omit<ComponentProps<typeof SelectContent>, "children">;
  control: Control<TFieldValues>;
  description?: ReactNode;
  errorClassName?: string;
  id?: string;
  inputClassName?: string;
  label?: ReactNode;
  labelClassName?: string;
  name: TName;
  orientation?: ComponentProps<typeof Field>["orientation"];
  placeholder?: string;
};

function DocumentTypeSelectField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  className,
  contentClassName,
  contentProps,
  control,
  description,
  errorClassName,
  id: providedId,
  inputClassName = "w-full",
  label = "Tipo de documento",
  labelClassName,
  name,
  orientation,
  placeholder = "Sin documento",
}: DocumentTypeSelectFieldProps<TFieldValues, TName>) {
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
        const selectValue = fieldValue || noDocumentTypeSelectValue;
        const errorMessage = fieldState.error?.message;
        const isInvalid = Boolean(errorMessage);
        const describedBy = [descriptionId, isInvalid ? errorId : undefined]
          .filter(Boolean)
          .join(" ");

        return (
          <Field
            className={className}
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
              <Select
                value={selectValue}
                onValueChange={(value) => {
                  field.onChange(
                    value === noDocumentTypeSelectValue ? "" : value,
                  );
                }}
              >
                <SelectTrigger
                  id={id}
                  aria-describedby={describedBy || undefined}
                  aria-invalid={isInvalid ? true : undefined}
                  className={inputClassName}
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent {...contentProps}>
                  <SelectGroup>
                    {documentTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
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

export { DocumentTypeSelectField, noDocumentTypeSelectValue };

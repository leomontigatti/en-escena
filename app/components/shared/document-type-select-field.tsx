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
  orientation?: SharedFieldOrientation;
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
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldValue = typeof field.value === "string" ? field.value : "";
        const selectValue = fieldValue || noDocumentTypeSelectValue;
        const errorMessage = fieldState.error?.message;

        return (
          <SharedFieldLayout
            className={className}
            contentClassName={contentClassName}
            description={description}
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
              </>
            )}
          </SharedFieldLayout>
        );
      }}
    />
  );
}

export { DocumentTypeSelectField };

import { useId, type ComponentProps, type ReactNode } from "react";

import { FieldControlLockIcon } from "@/components/shared/field-lock-icon";
import {
  SharedFieldLayout,
  type SharedFieldOrientation,
} from "@/components/shared/field-layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/shared/utils";

type ReadOnlyFieldProps = {
  autoComplete?: ComponentProps<typeof Input>["autoComplete"];
  className?: string;
  contentClassName?: string;
  displayValue?: string;
  hiddenValue?: string;
  id?: string;
  inputClassName?: string;
  label: ReactNode;
  labelClassName?: string;
  name?: string;
  orientation?: SharedFieldOrientation;
  type?: ComponentProps<typeof Input>["type"];
  value: string;
};

type ReadOnlyTextareaFieldProps = Omit<
  ReadOnlyFieldProps,
  "displayValue" | "inputClassName"
> & {
  textareaClassName?: string;
};

type ReadOnlyDateFieldProps = Omit<
  ReadOnlyFieldProps,
  "displayValue" | "hiddenValue" | "type" | "value"
> & {
  emptyLabel?: string;
  value: string | null | undefined;
};

type ReadOnlySelectFieldProps = Omit<
  ReadOnlyFieldProps,
  "displayValue" | "hiddenValue" | "type" | "value"
> & {
  emptyLabel?: string;
  options: readonly { value: string; label: string }[];
  value: string | null | undefined;
};

function ReadOnlyField({
  autoComplete,
  className,
  contentClassName,
  displayValue,
  hiddenValue,
  id: providedId,
  inputClassName,
  label,
  labelClassName,
  name,
  orientation,
  type,
  value,
}: ReadOnlyFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <SharedFieldLayout
      className={className}
      contentClassName={contentClassName}
      disabled
      id={id}
      label={label}
      labelClassName={labelClassName}
      orientation={orientation}
    >
      {({ describedBy }) => (
        <>
          <HiddenReadOnlyValue name={name} value={hiddenValue ?? value} />
          <div className="relative">
            <Input
              id={id}
              aria-describedby={describedBy}
              autoComplete={autoComplete}
              value={displayValue ?? value}
              disabled
              readOnly
              type={type}
              className={cn("pr-9", inputClassName)}
            />
            <FieldControlLockIcon />
          </div>
        </>
      )}
    </SharedFieldLayout>
  );
}

function ReadOnlyDateField({
  emptyLabel = "",
  value,
  ...props
}: ReadOnlyDateFieldProps) {
  const fieldValue = value ?? "";

  return (
    <ReadOnlyField
      {...props}
      value={fieldValue}
      displayValue={fieldValue ? formatDateOnlyValue(fieldValue) : emptyLabel}
    />
  );
}

function ReadOnlySelectField({
  emptyLabel = "",
  options,
  value,
  ...props
}: ReadOnlySelectFieldProps) {
  const fieldValue = value ?? "";
  const selectedLabel =
    options.find((option) => option.value === fieldValue)?.label ??
    (fieldValue ? fieldValue : emptyLabel);

  return (
    <ReadOnlyField {...props} value={fieldValue} displayValue={selectedLabel} />
  );
}

function ReadOnlyTextareaField({
  className,
  contentClassName,
  hiddenValue,
  id: providedId,
  label,
  labelClassName,
  name,
  orientation,
  textareaClassName,
  value,
}: ReadOnlyTextareaFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <SharedFieldLayout
      className={className}
      contentClassName={contentClassName}
      disabled
      id={id}
      label={label}
      labelClassName={labelClassName}
      orientation={orientation}
    >
      {({ describedBy }) => (
        <>
          <HiddenReadOnlyValue name={name} value={hiddenValue ?? value} />
          <div className="relative">
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={value}
              disabled
              readOnly
              className={cn("min-h-24 resize-none pr-9", textareaClassName)}
            />
            <FieldControlLockIcon className="top-3 translate-y-0" />
          </div>
        </>
      )}
    </SharedFieldLayout>
  );
}

function HiddenReadOnlyValue({
  name,
  value,
}: {
  name?: string;
  value: string;
}) {
  if (!name) {
    return null;
  }

  return <input type="hidden" name={name} value={value} />;
}

function formatDateOnlyValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  const monthNames = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  return `${day} de ${monthNames[month - 1]} de ${year}`;
}

export {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
  ReadOnlyTextareaField,
};

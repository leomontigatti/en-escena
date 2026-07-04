import { useId, type ReactNode } from "react";

import { FieldControlLockIcon } from "@/components/shared/field-lock-icon";
import {
  SharedFieldLayout,
  type SharedFieldOrientation,
} from "@/components/shared/field-layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/shared/utils";

type ReadOnlyFieldProps = {
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
  value: string;
};

type ReadOnlyTextareaFieldProps = Omit<
  ReadOnlyFieldProps,
  "displayValue" | "inputClassName"
> & {
  textareaClassName?: string;
};

function ReadOnlyField({
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
              value={displayValue ?? value}
              disabled
              readOnly
              className={cn("pr-9", inputClassName)}
            />
            <FieldControlLockIcon />
          </div>
        </>
      )}
    </SharedFieldLayout>
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

export { ReadOnlyField, ReadOnlyTextareaField };

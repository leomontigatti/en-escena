import { format } from "date-fns/format";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useMemo, useState, type ComponentProps } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { FieldControlLockIcon } from "@/components/shared/field-lock-icon";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";

type DateOnlyFieldBaseProps = {
  buttonClassName?: string;
  className?: string;
  disabled?: boolean;
  error?: string;
  errorClassName?: string;
  id?: string;
  label: string;
  labelClassName?: string;
  name: string;
  onBlur?: () => void;
  onValueChange?: (value: string) => void;
  orientation?: ComponentProps<typeof Field>["orientation"];
  startMonth?: Date;
  endMonth?: Date;
  value?: string;
};

type DateOnlyFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = Omit<
  DateOnlyFieldBaseProps,
  "error" | "name" | "onBlur" | "onValueChange" | "value"
> & {
  control: Control<TFieldValues>;
  name: TName;
};

export function DateOnlyField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({ control, ...props }: DateOnlyFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={props.name}
      render={({ field, fieldState }) => (
        <DateOnlyFieldControl
          {...props}
          name={field.name}
          value={typeof field.value === "string" ? field.value : ""}
          onBlur={field.onBlur}
          onValueChange={field.onChange}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

function DateOnlyFieldControl({
  buttonClassName,
  className,
  disabled = false,
  error,
  errorClassName,
  id: providedId,
  label,
  labelClassName,
  name,
  onBlur,
  onValueChange,
  orientation,
  startMonth,
  endMonth,
  value,
}: DateOnlyFieldBaseProps) {
  const id = providedId ?? name;
  const errorId = `${id}-error`;
  const [open, setOpen] = useState(false);
  const dateValue = getDateOnlyValue(value ?? "");
  const selectedDate = useMemo(
    () => (dateValue ? parseDateOnly(dateValue) : undefined),
    [dateValue],
  );

  return (
    <Field
      data-disabled={disabled ? true : undefined}
      data-invalid={error ? true : undefined}
      className={className}
      orientation={orientation}
    >
      <FieldLabel htmlFor={id} className={labelClassName}>
        {label}
      </FieldLabel>
      <FieldContent>
        <input type="hidden" name={name} value={dateValue} />
        <div className="relative">
          <Popover
            open={disabled ? false : open}
            onOpenChange={(nextOpen) => {
              if (!disabled) {
                setOpen(nextOpen);
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                id={id}
                disabled={disabled}
                type="button"
                variant="outline"
                className={cn(
                  "w-full cursor-pointer justify-between font-normal",
                  disabled && "pr-9",
                  buttonClassName,
                )}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onBlur={onBlur}
              >
                {selectedDate
                  ? format(selectedDate, "d 'de' MMMM 'de' yyyy", {
                      locale: es,
                    })
                  : "Elegí fecha"}
                {disabled ? null : <CalendarIcon data-icon="inline-end" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                captionLayout="dropdown"
                startMonth={startMonth}
                endMonth={endMonth}
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  const nextDate = date ? formatDateOnly(date) : "";
                  onValueChange?.(nextDate);
                  setOpen(false);
                }}
                locale={es}
              />
            </PopoverContent>
          </Popover>
          {disabled ? <FieldControlLockIcon /> : null}
        </div>
        <FieldError id={errorId} className={errorClassName}>
          {error}
        </FieldError>
      </FieldContent>
    </Field>
  );
}

function getDateOnlyValue(value: string) {
  return value.split("T")[0] ?? "";
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";

type DateOnlyFieldProps = {
  buttonClassName?: string;
  className?: string;
  defaultValue: string;
  error?: string;
  errorClassName?: string;
  id: string;
  label: string;
  labelClassName?: string;
  name: string;
  onBlur?: () => void;
  onValueChange?: (value: string) => void;
  startMonth?: Date;
  endMonth?: Date;
  value?: string;
};

export function DateOnlyField({
  buttonClassName,
  className,
  defaultValue,
  error,
  errorClassName,
  id,
  label,
  labelClassName,
  name,
  onBlur,
  onValueChange,
  startMonth,
  endMonth,
  value,
}: DateOnlyFieldProps) {
  const errorId = `${id}-error`;
  const [open, setOpen] = useState(false);
  const [internalDateValue, setInternalDateValue] = useState(
    getDateOnlyValue(defaultValue),
  );
  const dateValue =
    value === undefined ? internalDateValue : getDateOnlyValue(value);
  const selectedDate = useMemo(
    () => (dateValue ? parseDateOnly(dateValue) : undefined),
    [dateValue],
  );

  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <FieldLabel htmlFor={id} className={labelClassName}>
        {label}
      </FieldLabel>
      <input type="hidden" name={name} value={dateValue} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn("justify-start font-normal", buttonClassName)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onBlur={onBlur}
          >
            <CalendarIcon data-icon="inline-start" />
            {selectedDate
              ? format(selectedDate, "d 'de' MMMM 'de' yyyy", {
                  locale: es,
                })
              : "Elegí fecha"}
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
              setInternalDateValue(nextDate);
              onValueChange?.(nextDate);
              setOpen(false);
            }}
            locale={es}
          />
        </PopoverContent>
      </Popover>
      <FieldError id={errorId} className={errorClassName}>
        {error}
      </FieldError>
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

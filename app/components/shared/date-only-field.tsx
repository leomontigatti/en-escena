import { format } from "date-fns/format";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { FieldControlLockIcon } from "@/components/shared/field-lock-icon";
import {
  SharedFieldLayout,
  type SharedFieldOrientation,
} from "@/components/shared/field-layout";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";

/**
 * What the calendar may offer, as one value: the caller that knows one of these
 * knows all of them, and they only make sense together. `endMonth` bounds the
 * month dropdown while `latestSelectableDate` bounds the days inside the last
 * month it offers — a bound given only by month still shows clickable days past
 * it.
 */
type DateOnlyFieldCalendarBounds = {
  defaultMonth?: Date;
  startMonth?: Date;
  endMonth?: Date;
  latestSelectableDate?: Date;
};

type DateOnlyFieldBaseProps = {
  buttonClassName?: string;
  calendarBounds?: DateOnlyFieldCalendarBounds;
  className?: string;
  disabled?: boolean;
  error?: string;
  errorClassName?: string;
  id?: string;
  label: string;
  labelAdornment?: ReactNode;
  labelClassName?: string;
  name: string;
  onBlur?: () => void;
  onValueChange?: (value: string) => void;
  orientation?: SharedFieldOrientation;
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
  calendarBounds,
  className,
  disabled = false,
  error,
  errorClassName,
  id: providedId,
  label,
  labelAdornment,
  labelClassName,
  name,
  onBlur,
  onValueChange,
  orientation,
  value,
}: DateOnlyFieldBaseProps) {
  const id = providedId ?? name;
  const dateValue = getDateOnlyValue(value ?? "");

  return (
    <SharedFieldLayout
      className={className}
      disabled={disabled}
      error={error}
      errorClassName={errorClassName}
      id={id}
      label={label}
      labelAdornment={labelAdornment}
      labelClassName={labelClassName}
      orientation={orientation}
    >
      {({ describedBy, isInvalid }) => (
        <>
          <input type="hidden" name={name} value={dateValue} />
          <div className="relative">
            <DateOnlyFieldPicker
              buttonClassName={buttonClassName}
              calendarBounds={calendarBounds}
              dateValue={dateValue}
              describedBy={describedBy}
              disabled={disabled}
              id={id}
              isInvalid={isInvalid}
              onBlur={onBlur}
              onValueChange={onValueChange}
            />
            {disabled ? <FieldControlLockIcon /> : null}
          </div>
        </>
      )}
    </SharedFieldLayout>
  );
}

type DateOnlyFieldPickerProps = Pick<
  DateOnlyFieldBaseProps,
  "buttonClassName" | "calendarBounds" | "disabled" | "onBlur" | "onValueChange"
> & {
  dateValue: string;
  describedBy?: string;
  id: string;
  isInvalid: boolean;
};

function DateOnlyFieldPicker({
  buttonClassName,
  calendarBounds,
  dateValue,
  describedBy,
  disabled,
  id,
  isInvalid,
  onBlur,
  onValueChange,
}: DateOnlyFieldPickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(
    () => (dateValue ? parseDateOnly(dateValue) : undefined),
    [dateValue],
  );

  return (
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
          className={getTriggerClassName(disabled, buttonClassName)}
          aria-invalid={isInvalid ? true : undefined}
          aria-describedby={describedBy}
          onBlur={onBlur}
        >
          {getTriggerLabel(selectedDate)}
          {disabled ? null : <CalendarIcon data-icon="inline-end" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          captionLayout="dropdown"
          defaultMonth={calendarBounds?.defaultMonth}
          startMonth={calendarBounds?.startMonth}
          endMonth={calendarBounds?.endMonth}
          disabled={toDisabledDays(calendarBounds?.latestSelectableDate)}
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            onValueChange?.(date ? formatDateOnly(date) : "");
            setOpen(false);
          }}
          locale={es}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The trigger reads the chosen date, or invites the user to choose one. */
function getTriggerLabel(selectedDate: Date | undefined) {
  return selectedDate
    ? format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: es })
    : "Elegí fecha";
}

/** A locked field keeps room on the right for the lock icon drawn over it. */
function getTriggerClassName(
  disabled: boolean | undefined,
  buttonClassName: string | undefined,
) {
  return cn(
    "w-full cursor-pointer justify-between font-normal",
    disabled && "pr-9",
    buttonClassName,
  );
}

function toDisabledDays(latestSelectableDate: Date | undefined) {
  return latestSelectableDate ? { after: latestSelectableDate } : undefined;
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

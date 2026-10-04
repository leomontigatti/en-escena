import { Clock, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";

const defaultHourOptions = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const minuteStep = 5;
const defaultMinuteOptions = Array.from(
  { length: 60 / minuteStep },
  (_, step) => String(step * minuteStep).padStart(2, "0"),
);

type TimeOnlyFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  buttonClassName?: string;
  className?: string;
  /** Offers the clear action, for a field whose empty value means something. */
  clearable?: boolean;
  contentClassName?: string;
  control: Control<TFieldValues>;
  description?: ReactNode;
  errorClassName?: string;
  hourOptions?: readonly string[];
  id?: string;
  label: ReactNode;
  labelClassName?: string;
  minuteOptions?: readonly string[];
  name: TName;
  orientation?: SharedFieldOrientation;
  placeholder?: string;
};

function TimeOnlyField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  buttonClassName,
  className,
  clearable,
  contentClassName,
  control,
  description,
  errorClassName,
  hourOptions = defaultHourOptions,
  id,
  label,
  labelClassName,
  minuteOptions = defaultMinuteOptions,
  name,
  orientation,
  placeholder = "Seleccioná hora",
}: TimeOnlyFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TimeOnlyFieldControl
          buttonClassName={buttonClassName}
          className={className}
          clearable={clearable}
          contentClassName={contentClassName}
          description={description}
          error={fieldState.error?.message}
          errorClassName={errorClassName}
          hourOptions={hourOptions}
          id={id ?? field.name}
          label={label}
          labelClassName={labelClassName}
          minuteOptions={minuteOptions}
          name={field.name}
          onBlur={field.onBlur}
          onValueChange={field.onChange}
          orientation={orientation}
          placeholder={placeholder}
          value={typeof field.value === "string" ? field.value : ""}
        />
      )}
    />
  );
}

function TimeOnlyFieldControl({
  buttonClassName,
  className,
  clearable,
  contentClassName,
  description,
  error,
  errorClassName,
  hourOptions,
  id,
  label,
  labelClassName,
  minuteOptions,
  name,
  onBlur,
  onValueChange,
  orientation,
  placeholder,
  value,
}: {
  buttonClassName?: string;
  className?: string;
  clearable?: boolean;
  contentClassName?: string;
  description?: ReactNode;
  error?: string;
  errorClassName?: string;
  hourOptions: readonly string[];
  id: string;
  label: ReactNode;
  labelClassName?: string;
  minuteOptions: readonly string[];
  name: string;
  onBlur: () => void;
  onValueChange: (value: string) => void;
  orientation?: SharedFieldOrientation;
  placeholder: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const offeredMinuteOptions = withSavedMinute(minuteOptions, value);
  const { hour, minute } = parseTimeOnlyValue(value, {
    hourOptions,
    minuteOptions: offeredMinuteOptions,
  });

  function updateTime(nextPart: { hour?: string; minute?: string }) {
    const nextHour = nextPart.hour ?? hour ?? "00";
    const nextMinute = nextPart.minute ?? minute ?? "00";

    onValueChange(`${nextHour}:${nextMinute}`);
  }

  return (
    <SharedFieldLayout
      className={className}
      contentClassName={contentClassName}
      description={description}
      error={error}
      errorClassName={errorClassName}
      id={id}
      label={label}
      labelClassName={labelClassName}
      orientation={orientation}
    >
      {({ describedBy, isInvalid }) => (
        <>
          <input type="hidden" name={name} value={value} />
          <Popover
            open={open}
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen);

              if (!nextOpen) {
                onBlur();
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                id={id}
                type="button"
                variant="outline"
                className={cn(
                  "w-full cursor-pointer justify-between font-normal",
                  buttonClassName,
                )}
                aria-invalid={isInvalid ? true : undefined}
                aria-describedby={describedBy}
              >
                {value || placeholder}
                <Clock data-icon="inline-end" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <div className="grid grid-cols-2 gap-3">
                <TimePartSelect
                  label="Hora"
                  options={hourOptions}
                  placeholder="Hora"
                  value={hour ?? ""}
                  onValueChange={(nextHour) => updateTime({ hour: nextHour })}
                />
                <TimePartSelect
                  label="Minutos"
                  options={offeredMinuteOptions}
                  placeholder="Min."
                  value={minute ?? ""}
                  onValueChange={(nextMinute) =>
                    updateTime({ minute: nextMinute })
                  }
                />
              </div>
              {clearable && value ? (
                <div className="mt-3 border-t pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full cursor-pointer justify-start font-normal"
                    onClick={() => {
                      onValueChange("");
                      setOpen(false);
                    }}
                  >
                    <XIcon aria-hidden="true" data-icon="inline-start" />
                    Quitar hora
                  </Button>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        </>
      )}
    </SharedFieldLayout>
  );
}

function TimePartSelect({
  label,
  onValueChange,
  options,
  placeholder,
  value,
}: {
  label: ReactNode;
  onValueChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
  value: string;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * A time saved off the steps (`18:07`, from before they existed) keeps its
 * minute on offer, so picking only a new hour does not round it to `00`.
 */
function withSavedMinute(minuteOptions: readonly string[], value: string) {
  const minute = value.split(":")[1];

  if (!minute || !/^[0-5]\d$/.test(minute) || minuteOptions.includes(minute)) {
    return minuteOptions;
  }

  return [...minuteOptions, minute].sort();
}

function parseTimeOnlyValue(
  value: string,
  {
    hourOptions,
    minuteOptions,
  }: {
    hourOptions: readonly string[];
    minuteOptions: readonly string[];
  },
) {
  const [hour, minute] = value.split(":");

  return {
    hour: hour && hourOptions.includes(hour) ? hour : undefined,
    minute: minute && minuteOptions.includes(minute) ? minute : undefined,
  };
}

export { TimeOnlyField, parseTimeOnlyValue };

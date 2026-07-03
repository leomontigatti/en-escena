import { Clock } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
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
const defaultMinuteOptions = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);

type TimeOnlyFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  buttonClassName?: string;
  className?: string;
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
  orientation?: ComponentProps<typeof Field>["orientation"];
  placeholder?: string;
};

function TimeOnlyField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  buttonClassName,
  className,
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
  orientation?: ComponentProps<typeof Field>["orientation"];
  placeholder: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = `${id}-error`;
  const { hour, minute } = parseTimeOnlyValue(value, {
    hourOptions,
    minuteOptions,
  });
  const describedBy = [descriptionId, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  function updateTime(nextPart: { hour?: string; minute?: string }) {
    const nextHour = nextPart.hour ?? hour ?? "00";
    const nextMinute = nextPart.minute ?? minute ?? "00";

    onValueChange(`${nextHour}:${nextMinute}`);
  }

  return (
    <Field
      className={className}
      data-invalid={error ? true : undefined}
      orientation={orientation}
    >
      <FieldLabel htmlFor={id} className={labelClassName}>
        {label}
      </FieldLabel>
      <FieldContent className={contentClassName}>
        {description ? (
          <FieldDescription id={descriptionId}>{description}</FieldDescription>
        ) : null}
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
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
            >
              {value || placeholder}
              <Clock data-icon="inline-end" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start">
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Hora</FieldLabel>
                <Select
                  value={hour ?? ""}
                  onValueChange={(nextHour) => updateTime({ hour: nextHour })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Hora" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {hourOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Minutos</FieldLabel>
                <Select
                  value={minute ?? ""}
                  onValueChange={(nextMinute) =>
                    updateTime({ minute: nextMinute })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Min." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {minuteOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </PopoverContent>
        </Popover>
        <FieldError id={errorId} className={errorClassName}>
          {error}
        </FieldError>
      </FieldContent>
    </Field>
  );
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

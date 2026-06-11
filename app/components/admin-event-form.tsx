import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MAX_REQUIRED_DEPOSIT_PERCENTAGE,
  MIN_REQUIRED_DEPOSIT_PERCENTAGE,
  type EventFormValues,
  type FieldErrors,
} from "@/lib/admin-event-form-values";

type EventFormFieldsProps = {
  values: EventFormValues;
  fieldErrors?: FieldErrors;
};

export function EventFormFields({
  values,
  fieldErrors = {},
}: EventFormFieldsProps) {
  const [registrationStartsAt, setRegistrationStartsAt] = useState(
    values.registrationStartsAt,
  );
  const [startsAt, setStartsAt] = useState(values.startsAt);
  const showRegistrationStartWarning =
    registrationStartsAt !== "" &&
    startsAt !== "" &&
    registrationStartsAt > startsAt;

  return (
    <FieldGroup>
      <TextField
        label="Nombre"
        name="name"
        defaultValue={values.name}
        error={fieldErrors.name}
      />
      <DateTimeField
        label="Inicio de inscripción"
        name="registrationStartsAt"
        defaultValue={values.registrationStartsAt}
        error={fieldErrors.registrationStartsAt}
        onValueChange={setRegistrationStartsAt}
      />
      <DateTimeField
        label="Cierre de inscripción"
        name="registrationEndsAt"
        defaultValue={values.registrationEndsAt}
        error={fieldErrors.registrationEndsAt}
      />
      <DateTimeField
        label="Inicio del Evento"
        name="startsAt"
        defaultValue={values.startsAt}
        error={fieldErrors.startsAt}
        onValueChange={setStartsAt}
      />
      <DateTimeField
        label="Cierre del Evento"
        name="endsAt"
        defaultValue={values.endsAt}
        error={fieldErrors.endsAt}
      />
      <TextField
        label="Seña requerida (%)"
        name="requiredDepositPercentage"
        type="number"
        min={MIN_REQUIRED_DEPOSIT_PERCENTAGE}
        max={MAX_REQUIRED_DEPOSIT_PERCENTAGE}
        step="1"
        defaultValue={values.requiredDepositPercentage}
        error={fieldErrors.requiredDepositPercentage}
      />

      {showRegistrationStartWarning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          La inscripción empieza después del inicio del Evento. Podés guardar
          esta configuración si es intencional.
        </p>
      ) : null}
    </FieldGroup>
  );
}

function TextField({
  label,
  name,
  error,
  ...inputProps
}: {
  label: string;
  name: keyof EventFormValues;
  error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        {...inputProps}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

function DateTimeField({
  label,
  name,
  defaultValue,
  error,
  onValueChange,
}: {
  label: string;
  name: keyof EventFormValues;
  defaultValue: string;
  error?: string;
  onValueChange?: (value: string) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const parsedValue = splitDateTimeValue(defaultValue);
  const [dateValue, setDateValue] = useState(parsedValue.date);
  const [timeValue, setTimeValue] = useState(parsedValue.time);
  const selectedDate = useMemo(
    () => (dateValue ? parseDateOnly(dateValue) : undefined),
    [dateValue],
  );
  const value = dateValue && timeValue ? `${dateValue}T${timeValue}` : "";

  function updateValue(nextDate: string, nextTime: string) {
    const nextValue = nextDate && nextTime ? `${nextDate}T${nextTime}` : "";
    onValueChange?.(nextValue);
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={`${id}-time`}>{label}</FieldLabel>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="justify-start font-normal sm:flex-1"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
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
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                const nextDate = date ? formatDateOnly(date) : "";
                setDateValue(nextDate);
                updateValue(nextDate, timeValue);
              }}
              locale={es}
            />
          </PopoverContent>
        </Popover>
        <Input
          id={`${id}-time`}
          type="time"
          required
          value={timeValue}
          onChange={(event) => {
            const nextTime = event.currentTarget.value;
            setTimeValue(nextTime);
            updateValue(dateValue, nextTime);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="sm:w-32"
        />
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

function splitDateTimeValue(value: string) {
  const [date = "", time = ""] = value.split("T");

  return {
    date,
    time,
  };
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

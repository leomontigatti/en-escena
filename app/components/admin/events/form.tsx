import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { TriangleAlert } from "lucide-react";
import {
  Controller,
  type FieldPathByValue,
  useForm,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInput } from "@/components/shared/integer-input-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  MAX_REQUIRED_DEPOSIT_PERCENTAGE,
  MIN_REQUIRED_DEPOSIT_PERCENTAGE,
  eventFormSchema,
  type EventFormValues,
  type FieldErrors,
} from "@/lib/admin/events/form-values";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  type RouteFormPendingScope,
  useApplyServerFieldErrors,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";

type EventFormReturn = UseFormReturn<EventFormValues, unknown, EventFormValues>;
type EventFormStringFieldName = FieldPathByValue<EventFormValues, string>;

export type EventFormController = {
  form: EventFormReturn;
  isPending: boolean;
  handleSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
};

type EventFormFieldsProps = {
  controller: EventFormController;
};

const emptyEventFieldErrors: FieldErrors = {};

export function useEventForm({
  values,
  fieldErrors = emptyEventFieldErrors,
  pendingScope,
}: {
  values: EventFormValues;
  fieldErrors?: FieldErrors;
  pendingScope?: RouteFormPendingScope;
}): EventFormController {
  const form = useForm<EventFormValues, unknown, EventFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(eventFormSchema),
  });
  const formAction = useOptionalFormAction();
  const navigation = useOptionalNavigation();
  const submit = useOptionalSubmit();

  useEffect(() => {
    form.reset(values);
  }, [
    form,
    values.endsAt,
    values.name,
    values.registrationEndsAt,
    values.registrationStartsAt,
    values.requiredDepositPercentage,
    values.startsAt,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  return {
    form,
    handleSubmit: createValidatedRouteSubmitHandler(form, submit, formAction),
    isPending: pendingScope
      ? isRouteFormPending(navigation, pendingScope)
      : false,
  };
}

export function EventFormFields({ controller }: EventFormFieldsProps) {
  const { form } = controller;
  const registrationStartsAt = useWatch({
    control: form.control,
    name: "registrationStartsAt",
  });
  const startsAt = useWatch({
    control: form.control,
    name: "startsAt",
  });
  const showRegistrationStartWarning =
    registrationStartsAt !== "" &&
    startsAt !== "" &&
    registrationStartsAt > startsAt;

  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <TextField eventForm={form} label="Nombre" name="name" />
      <TextField
        eventForm={form}
        label="Seña (%)"
        name="requiredDepositPercentage"
        min={MIN_REQUIRED_DEPOSIT_PERCENTAGE}
        max={MAX_REQUIRED_DEPOSIT_PERCENTAGE}
        step="1"
      />
      <EventDateField
        eventForm={form}
        label="Inicio de inscripciones"
        name="registrationStartsAt"
      />
      <EventDateField
        eventForm={form}
        label="Cierre de inscripciones"
        name="registrationEndsAt"
      />
      <EventDateField
        eventForm={form}
        label="Inicio del evento"
        name="startsAt"
      />
      <EventDateField
        eventForm={form}
        label="Cierre del evento"
        name="endsAt"
      />

      {showRegistrationStartWarning ? (
        <Alert variant="warning" className="md:col-span-2">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            La inscripción empieza después del inicio del evento. Podés guardar
            esta configuración si es intencional.
          </AlertDescription>
        </Alert>
      ) : null}
    </FieldGroup>
  );
}

function TextField<TName extends EventFormStringFieldName>({
  eventForm,
  label,
  name,
  ...inputProps
}: {
  eventForm: EventFormReturn;
  label: string;
  name: TName;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<EventFormValues, TName>
      control={eventForm.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {name === "requiredDepositPercentage" ? (
            <IntegerInput
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={fieldState.error ? errorId : undefined}
              autoComplete="off"
              {...field}
              {...inputProps}
            />
          ) : (
            <Input
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={fieldState.error ? errorId : undefined}
              autoComplete="off"
              {...field}
              {...inputProps}
            />
          )}
          <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
        </Field>
      )}
    />
  );
}

function EventDateField<TName extends EventFormStringFieldName>({
  eventForm,
  label,
  name,
}: {
  eventForm: EventFormReturn;
  label: string;
  name: TName;
}) {
  const id = useId();

  return (
    <Controller<EventFormValues, TName>
      control={eventForm.control}
      name={name}
      render={({ field, fieldState }) => (
        <DateOnlyField
          id={id}
          label={label}
          name={field.name}
          defaultValue={field.value}
          error={fieldState.error?.message}
          onBlur={field.onBlur}
          onValueChange={field.onChange}
          value={field.value}
        />
      )}
    />
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";

import { AlertStack } from "@/components/shared/alert-stack";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import {
  MAX_REQUIRED_DEPOSIT_PERCENTAGE,
  MIN_REQUIRED_DEPOSIT_PERCENTAGE,
  eventFormSchema,
  type EventFormValues,
} from "@/lib/admin/events/form-values";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  type RouteFormPendingScope,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";

type EventFormReturn = UseFormReturn<EventFormValues, unknown, EventFormValues>;

export type EventFormController = {
  form: EventFormReturn;
  isPending: boolean;
  handleSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
};

type EventFormFieldsProps = {
  controller: EventFormController;
};

export function useEventForm({
  values,
  pendingScope,
}: {
  values: EventFormValues;
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

  return {
    form,
    handleSubmit: createValidatedRouteSubmitHandler(form, submit, formAction),
    isPending: pendingScope
      ? isRouteFormPending(navigation, pendingScope)
      : false,
  };
}

/**
 * The event's name, which stays above the detail view's tabs. Kept to a single
 * grid cell so its width matches the fields inside the tabs.
 */
export function EventNameField({ controller }: EventFormFieldsProps) {
  const { form } = controller;

  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <TextInputField control={form.control} label="Nombre" name="name" />
      <div aria-hidden="true" className="hidden md:block" />
    </FieldGroup>
  );
}

/**
 * Everything about the event that is not its name or its documents: the
 * deposit, the event window and the inscription window.
 *
 * `formId` associates the inputs with a `<form>` they are not nested in — the
 * detail view renders this inside a tab that sits outside the form element,
 * because the sibling documents tab has upload forms of its own and forms
 * cannot nest. The create view passes nothing and nests normally.
 */
export function EventInformationFields({
  controller,
  formId,
}: EventFormFieldsProps & { formId?: string }) {
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
      <IntegerInputField
        control={form.control}
        form={formId}
        label="Seña (%)"
        name="requiredDepositPercentage"
        min={MIN_REQUIRED_DEPOSIT_PERCENTAGE}
        max={MAX_REQUIRED_DEPOSIT_PERCENTAGE}
        step="1"
      />
      {/* Keeps the deposit alone on its row without stretching it across both
          cells, so it lines up with the date fields underneath. */}
      <div aria-hidden="true" className="hidden md:block" />
      <DateOnlyField
        control={form.control}
        form={formId}
        label="Inicio del evento"
        name="startsAt"
      />
      <DateOnlyField
        control={form.control}
        form={formId}
        label="Cierre del evento"
        name="endsAt"
      />
      <DateOnlyField
        control={form.control}
        form={formId}
        label="Inicio de inscripciones"
        name="registrationStartsAt"
      />
      <DateOnlyField
        control={form.control}
        form={formId}
        label="Cierre de inscripciones"
        name="registrationEndsAt"
      />

      <AlertStack className="md:col-span-2">
        {showRegistrationStartWarning ? (
          <Alert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>
              La inscripción empieza después del inicio del evento. Podés
              guardar esta configuración si es intencional.
            </AlertDescription>
          </Alert>
        ) : null}
      </AlertStack>
    </FieldGroup>
  );
}

export function EventFormFields({ controller }: EventFormFieldsProps) {
  return (
    <div className="flex flex-col gap-5">
      <EventNameField controller={controller} />
      <EventInformationFields controller={controller} />
    </div>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";

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
 * Everything the administration edits about the event itself. One two-column
 * grid throughout: the name and the deposit sit alone on a row at a single
 * cell's width so they line up with the date fields underneath, which pair off
 * as the event window and then the inscription window.
 */
export function EventFormFields({ controller }: EventFormFieldsProps) {
  const { form } = controller;

  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <TextInputField control={form.control} label="Nombre" name="name" />
      <FieldGridSpacer />
      <IntegerInputField
        control={form.control}
        label="Seña (%)"
        name="requiredDepositPercentage"
        min={MIN_REQUIRED_DEPOSIT_PERCENTAGE}
        max={MAX_REQUIRED_DEPOSIT_PERCENTAGE}
        step="1"
      />
      <FieldGridSpacer />
      <DateOnlyField
        control={form.control}
        label="Inicio del evento"
        name="startsAt"
      />
      <DateOnlyField
        control={form.control}
        label="Cierre del evento"
        name="endsAt"
      />
      <DateOnlyField
        control={form.control}
        label="Inicio de inscripciones"
        name="registrationStartsAt"
      />
      <DateOnlyField
        control={form.control}
        label="Cierre de inscripciones"
        name="registrationEndsAt"
      />
    </FieldGroup>
  );
}

/** Holds a field to one cell instead of letting it span the row. */
function FieldGridSpacer() {
  return <div aria-hidden="true" className="hidden md:block" />;
}

/**
 * Inscriptions opening after the event starts is legal but almost always a
 * typo, so it warns instead of blocking. Returned as a boolean rather than as
 * an element: the alert belongs to the `AlertStack` above the card, and an
 * `AlertStack` given a component that renders `null` still renders its own
 * wrapper and its own gap.
 */
export function useEventRegistrationWindowWarning({
  controller,
}: EventFormFieldsProps) {
  const { form } = controller;
  const registrationStartsAt = useWatch({
    control: form.control,
    name: "registrationStartsAt",
  });
  const startsAt = useWatch({ control: form.control, name: "startsAt" });

  return (
    registrationStartsAt !== "" &&
    startsAt !== "" &&
    registrationStartsAt > startsAt
  );
}

export function EventRegistrationWindowAlert() {
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        La inscripción empieza después del inicio del evento. Podés guardar esta
        configuración si es intencional.
      </AlertDescription>
    </Alert>
  );
}

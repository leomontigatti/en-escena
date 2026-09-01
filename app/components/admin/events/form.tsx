import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { TextInputField } from "@/components/shared/text-input-field";
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
 * Everything the administration edits about the event itself, in a two-column
 * grid: the name and the deposit share the first row, then the dates pair off
 * as the event window and the inscription window.
 */
export function EventFormFields({ controller }: EventFormFieldsProps) {
  const { form } = controller;

  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <TextInputField control={form.control} label="Nombre" name="name" />
      <IntegerInputField
        control={form.control}
        label="Seña (%)"
        name="requiredDepositPercentage"
        min={MIN_REQUIRED_DEPOSIT_PERCENTAGE}
        max={MAX_REQUIRED_DEPOSIT_PERCENTAGE}
        step="1"
      />
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

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { SharedFieldLayout } from "@/components/shared/field-layout";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SeminarPriceActionValues } from "@/lib/admin/events/bases-action/shared.server";
import { openPriceGuard, type PriceGuard } from "@/lib/prices/guards";
import { seminarKindOptions } from "@/lib/seminars/seminar-kinds";
import {
  createValidatedRouteSubmitHandler,
  type RouteFormPendingScope,
  useOptionalFormAction,
  useOptionalSubmit,
} from "@/lib/shared/forms";
import { cn } from "@/lib/shared/utils";

import { EventBasesFormActions } from "../events/bases-form-actions";
import {
  GuardedAmountField,
  GuardedDeadlineField,
  GuardedSelectField,
} from "../prices/guarded-fields";
import { seminarPricesListPath } from "./shared";
import {
  participantsSwitchLabel,
  seminarPriceFormSchema,
  type SeminarPriceFormValues,
} from "./view-shared";

type SeminarPriceFormController = UseFormReturn<SeminarPriceFormValues>;

type SeminarPriceFormDefaultValueProps = {
  amount?: number;
  forParticipants?: boolean;
  kind?: string;
  name?: string | null;
  paymentDeadline?: string | null;
  submittedValues?: SeminarPriceActionValues;
};

type SeminarPriceFormProps = {
  form: SeminarPriceFormController;
  formId?: string;
  /** What the guards would refuse; a row being created is never guarded. */
  guard?: PriceGuard;
  id?: string;
  intent: string;
};

function getSeminarPriceFormDefaultValues({
  amount,
  forParticipants,
  kind,
  name,
  paymentDeadline,
  submittedValues,
}: SeminarPriceFormDefaultValueProps) {
  if (submittedValues) {
    return {
      name: submittedValues.name,
      forParticipants: submittedValues.forParticipants === "true",
      kind: submittedValues.kind,
      amount: submittedValues.amount,
      paymentDeadline: submittedValues.paymentDeadline,
    } satisfies SeminarPriceFormValues;
  }

  return {
    name: name ?? "",
    forParticipants: forParticipants ?? true,
    kind: kind ?? "",
    amount: amount ? String(amount) : "",
    paymentDeadline: paymentDeadline ?? "",
  } satisfies SeminarPriceFormValues;
}

/**
 * The form's state, owned by the page rather than by the fields, because
 * "Guardar" lives outside the `<form>` and stays disabled until something
 * actually changed.
 */
export function useSeminarPriceForm({
  amount,
  forParticipants,
  kind,
  name,
  paymentDeadline,
  submittedValues,
}: SeminarPriceFormDefaultValueProps): SeminarPriceFormController {
  const defaultValues = useMemo(
    () =>
      getSeminarPriceFormDefaultValues({
        amount,
        forParticipants,
        kind,
        name,
        paymentDeadline,
        submittedValues,
      }),
    [amount, forParticipants, kind, name, paymentDeadline, submittedValues],
  );
  const form = useForm<SeminarPriceFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(seminarPriceFormSchema),
  });
  const { reset } = form;

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  return form;
}

export function SeminarPriceForm({
  form,
  formId,
  guard = openPriceGuard,
  id,
  intent,
}: SeminarPriceFormProps) {
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();
  const values = form.watch();

  return (
    <form
      id={formId}
      method="post"
      className="flex w-full flex-col gap-5"
      onSubmit={createValidatedRouteSubmitHandler(form, submit, formAction)}
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <FieldGroup>
        <NameField form={form} canEditStructure={guard.canEditStructure} />
        <GuardedDeadlineField
          fieldId={`seminar-price-payment-deadline-${id ?? intent}`}
          form={form}
          guard={guard}
          isExistingRow={Boolean(id)}
          name="paymentDeadline"
          value={values.paymentDeadline}
        />
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <GuardedSelectField
            fieldId={`seminar-price-kind-${id ?? intent}`}
            form={form}
            guard={guard}
            label="Tipo de seminario"
            name="kind"
            options={seminarKindOptions}
            placeholder="Elegí un tipo"
            value={values.kind}
          />
          <GuardedAmountField
            fieldId={`seminar-price-amount-${id ?? intent}`}
            form={form}
            guard={guard}
            name="amount"
            value={values.amount}
          />
        </FieldGroup>
      </FieldGroup>
    </form>
  );
}

export function SeminarPriceFormActions({
  form,
  formId,
  pendingScope,
}: {
  form: SeminarPriceFormController;
  formId: string;
  pendingScope: RouteFormPendingScope;
}) {
  return (
    <EventBasesFormActions
      // "Volver" goes to the `Seminarios` tab of `Precios`, which is the list
      // these rows are read on: `/administracion/precios/seminarios` is a
      // prefix of the form routes, not a screen.
      basePath={seminarPricesListPath}
      control={form.control}
      formId={formId}
      pendingScope={pendingScope}
    />
  );
}

export function SeminarPriceFormPanel({ children }: { children: ReactNode }) {
  return <AdminResourceFormCard>{children}</AdminResourceFormCard>;
}

/**
 * The name carries the participant switch inside the input, as the choreography
 * `Nombre` carries `Precio especial`: the flag is a property of the row that the
 * name is already describing, not a field of its own.
 */
function NameField({
  canEditStructure,
  form,
}: {
  canEditStructure: boolean;
  form: SeminarPriceFormController;
}) {
  const id = useId();
  const error = form.formState.errors.name?.message;

  return (
    <SharedFieldLayout error={error} id={id} label="Nombre">
      {({ describedBy, isInvalid }) => (
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <div className="relative">
              <Input
                id={id}
                aria-describedby={describedBy || undefined}
                aria-invalid={isInvalid ? true : undefined}
                autoComplete="off"
                className="pr-14"
                {...field}
              />
              <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center">
                <ParticipantsSwitch form={form} disabled={!canEditStructure} />
              </div>
            </div>
          )}
        />
      )}
    </SharedFieldLayout>
  );
}

// The switch shape of the form, as on the choreography price form: a hidden
// input so the boolean reaches the action, and a tooltip on the control.
type SeminarPriceSwitchProps = {
  disabled?: boolean;
  form: SeminarPriceFormController;
  label: string;
  name: "forParticipants";
};

function SeminarPriceSwitch({
  disabled = false,
  form,
  label,
  name,
}: SeminarPriceSwitchProps) {
  const id = useId();

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <>
          <input
            type="hidden"
            name={field.name}
            value={field.value ? "true" : "false"}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Switch
                  id={id}
                  aria-label={label}
                  className={cn(
                    "border-border shadow-xs",
                    field.value ? "!bg-primary" : "!bg-muted",
                  )}
                  checked={field.value}
                  disabled={disabled}
                  onBlur={field.onBlur}
                  onCheckedChange={field.onChange}
                />
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
    />
  );
}

function ParticipantsSwitch({
  disabled,
  form,
}: {
  disabled: boolean;
  form: SeminarPriceFormController;
}) {
  return (
    <SeminarPriceSwitch
      disabled={disabled}
      form={form}
      label={participantsSwitchLabel}
      name="forParticipants"
    />
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { SharedFieldLayout } from "@/components/shared/field-layout";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { seminarKindOptions } from "@/lib/seminars/seminar-kinds";
import {
  createValidatedRouteSubmitHandler,
  type RouteFormPendingScope,
  useOptionalFormAction,
  useOptionalSubmit,
} from "@/lib/shared/forms";
import { cn } from "@/lib/shared/utils";

import { EventBasesFormActions } from "../events/bases-form-actions";
import { openEndedDeadlineLabel } from "../prices/view-shared";
import { seminarPricesListPath } from "./shared";
import {
  participantsSwitchLabel,
  seminarPriceFormSchema,
  type SeminarPriceFormValues,
  type SeminarPriceGuard,
} from "./view-shared";

type SeminarPriceFormController = UseFormReturn<SeminarPriceFormValues>;

const openGuard: SeminarPriceGuard = {
  canEditAmount: true,
  canEditStructure: true,
  canDelete: true,
  reason: null,
};

type SeminarPriceFormProps = {
  amount?: number;
  forParticipants?: boolean;
  formId?: string;
  /** What the guards would refuse; a row being created is never guarded. */
  guard?: SeminarPriceGuard;
  id?: string;
  intent: string;
  kind?: string;
  name?: string | null;
  paymentDeadline?: string | null;
  submittedValues?: SeminarPriceActionValues;
};

function getSeminarPriceFormDefaultValues({
  amount,
  forParticipants,
  kind,
  name,
  paymentDeadline,
  submittedValues,
}: Omit<SeminarPriceFormProps, "formId" | "guard" | "id" | "intent">) {
  if (submittedValues) {
    return {
      name: submittedValues.name,
      forParticipants: submittedValues.forParticipants === "true",
      isOpenEnded: submittedValues.isOpenEnded === "true",
      kind: submittedValues.kind,
      amount: submittedValues.amount,
      paymentDeadline: submittedValues.paymentDeadline,
    } satisfies SeminarPriceFormValues;
  }

  return {
    name: name ?? "",
    forParticipants: forParticipants ?? true,
    isOpenEnded: paymentDeadline === null,
    kind: kind ?? "",
    amount: amount ? String(amount) : "",
    paymentDeadline: paymentDeadline ?? "",
  } satisfies SeminarPriceFormValues;
}

export function SeminarPriceForm({
  amount,
  forParticipants,
  formId,
  guard = openGuard,
  id,
  intent,
  kind,
  name,
  paymentDeadline,
  submittedValues,
}: SeminarPriceFormProps) {
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
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

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
      <GuardAlert reason={guard.reason} />
      <FieldGroup>
        <NameField form={form} canEditStructure={guard.canEditStructure} />
        <DeadlineField
          fieldId={`seminar-price-payment-deadline-${id ?? intent}`}
          form={form}
          guard={guard}
          values={values}
        />
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <KindField
            fieldId={`seminar-price-kind-${id ?? intent}`}
            form={form}
            guard={guard}
            values={values}
          />
          <AmountField
            fieldId={`seminar-price-amount-${id ?? intent}`}
            form={form}
            guard={guard}
            values={values}
          />
        </FieldGroup>
      </FieldGroup>
    </form>
  );
}

/** Why a field is locked, above the fields it locks. */
function GuardAlert({ reason }: { reason: string | null }) {
  if (!reason) {
    return null;
  }

  return (
    <Alert variant="info">
      <InfoIcon aria-hidden="true" />
      <AlertDescription>{reason}</AlertDescription>
    </Alert>
  );
}

/**
 * The three structural fields read the same way: the editable control while the
 * guard allows the change, the shared read-only look otherwise, with the value
 * still travelling in the body so a save of the fields that are open does not
 * blank the ones that are locked.
 */
type GuardedFieldProps = {
  fieldId: string;
  form: SeminarPriceFormController;
  guard: SeminarPriceGuard;
  values: SeminarPriceFormValues;
};

function DeadlineField({ fieldId, form, guard, values }: GuardedFieldProps) {
  if (!guard.canEditStructure) {
    return (
      <>
        <ReadOnlyDateField
          id={fieldId}
          label="Fecha límite de pago"
          name="paymentDeadline"
          emptyLabel={openEndedDeadlineLabel}
          value={values.paymentDeadline || null}
        />
        <input
          type="hidden"
          name="isOpenEnded"
          value={values.isOpenEnded ? "true" : "false"}
        />
      </>
    );
  }

  return (
    <DateOnlyField
      control={form.control}
      name="paymentDeadline"
      disabled={values.isOpenEnded}
      id={fieldId}
      label="Fecha límite de pago"
      labelAdornment={<OpenEndedSwitch form={form} />}
    />
  );
}

function KindField({ fieldId, form, guard, values }: GuardedFieldProps) {
  if (!guard.canEditStructure) {
    return (
      <ReadOnlySelectField
        id={fieldId}
        label="Tipo de seminario"
        name="kind"
        options={seminarKindOptions}
        value={values.kind}
      />
    );
  }

  return (
    <SelectField
      control={form.control}
      label="Tipo de seminario"
      name="kind"
      options={seminarKindOptions}
      placeholder="Elegí un tipo"
    />
  );
}

function AmountField({ fieldId, form, guard, values }: GuardedFieldProps) {
  if (!guard.canEditAmount) {
    return (
      <ReadOnlyField
        id={fieldId}
        label="Monto"
        name="amount"
        value={values.amount}
      />
    );
  }

  return (
    <IntegerInputField
      control={form.control}
      label="Monto"
      min="1"
      name="amount"
      step="1"
    />
  );
}

export function SeminarPriceFormActions({
  formId,
  pendingScope,
}: {
  formId: string;
  pendingScope: RouteFormPendingScope;
}) {
  return (
    <EventBasesFormActions
      // "Volver" goes to the `Seminarios` tab of `Precios`, which is the list
      // these rows are read on: `/administracion/precios/seminarios` is a
      // prefix of the form routes, not a screen.
      basePath={seminarPricesListPath}
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

// One switch shape for both toggles of the form, as on the choreography price
// form: a hidden input so the boolean reaches the action, a tooltip on the
// control, and the field the toggle governs cleared on the edge that needs it.
type SeminarPriceSwitchProps = {
  disabled?: boolean;
  form: SeminarPriceFormController;
  label: string;
  name: "forParticipants" | "isOpenEnded";
  onToggle?: (checked: boolean) => void;
};

function SeminarPriceSwitch({
  disabled = false,
  form,
  label,
  name,
  onToggle,
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
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    onToggle?.(checked);
                  }}
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

function OpenEndedSwitch({ form }: { form: SeminarPriceFormController }) {
  return (
    <SeminarPriceSwitch
      form={form}
      label={openEndedDeadlineLabel}
      name="isOpenEnded"
      onToggle={(checked) => {
        if (checked) {
          form.setValue("paymentDeadline", "", {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
      }}
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

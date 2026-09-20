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
import type { PriceActionValues } from "@/lib/admin/events/bases-action/shared.server";
import { groupTypeOptions } from "@/lib/events/group-types";
import type { ScheduleListItem } from "@/lib/events/bases.server";
import { openPriceGuard, type PriceGuard } from "@/lib/prices/guards";
import { cn } from "@/lib/shared/utils";
import {
  createValidatedRouteSubmitHandler,
  type RouteFormPendingScope,
  useOptionalFormAction,
  useOptionalSubmit,
} from "@/lib/shared/forms";

import { EventBasesFormActions } from "../events/bases-form-actions";
import {
  GuardedAmountField,
  GuardedDeadlineField,
  GuardedSelectField,
} from "./guarded-fields";
import {
  EMPTY_SCHEDULE_VALUE,
  priceFormSchema,
  type PriceFormValues,
} from "./view-shared";
import { basePath } from "./shared";

type PriceFormController = UseFormReturn<PriceFormValues>;
type PriceFormDefaultValueProps = {
  amount?: number;
  groupType?: string;
  name?: string | null;
  paymentDeadline?: string | null;
  scheduleId?: string | null;
  submittedValues?: PriceActionValues;
};
type PriceFormProps = {
  form: PriceFormController;
  formId?: string;
  /** What the guards would refuse; a row being created is never guarded. */
  guard?: PriceGuard;
  id?: string;
  intent: string;
  schedules: ScheduleListItem[];
};

function getPriceFormDefaultValues({
  amount,
  groupType,
  name,
  paymentDeadline,
  scheduleId,
  submittedValues,
}: PriceFormDefaultValueProps): PriceFormValues {
  if (submittedValues) {
    return {
      name: submittedValues.name,
      isSpecialPrice:
        submittedValues.isSpecialPrice === "true" ||
        submittedValues.scheduleId.length > 0,
      groupType: submittedValues.groupType,
      amount: submittedValues.amount,
      paymentDeadline: submittedValues.paymentDeadline,
      scheduleId: submittedValues.scheduleId || EMPTY_SCHEDULE_VALUE,
    };
  }

  return {
    name: name ?? "",
    isSpecialPrice: Boolean(scheduleId),
    groupType: groupType ?? "",
    amount: amount ? String(amount) : "",
    paymentDeadline: paymentDeadline ?? "",
    scheduleId: scheduleId ?? EMPTY_SCHEDULE_VALUE,
  };
}

/**
 * The form's state, owned by the page rather than by the fields, because
 * "Guardar" lives outside the `<form>` and stays disabled until something
 * actually changed.
 */
export function usePriceForm({
  amount,
  groupType,
  name,
  paymentDeadline,
  scheduleId,
  submittedValues,
}: PriceFormDefaultValueProps): PriceFormController {
  const defaultValues = useMemo(
    () =>
      getPriceFormDefaultValues({
        amount,
        groupType,
        name,
        paymentDeadline,
        scheduleId,
        submittedValues,
      }),
    [amount, groupType, name, paymentDeadline, scheduleId, submittedValues],
  );
  const form = useForm<PriceFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(priceFormSchema),
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  return form;
}

export function PriceForm({
  form,
  formId,
  guard = openPriceGuard,
  id,
  intent,
  schedules,
}: PriceFormProps) {
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();
  const values = form.watch();
  const fieldIdSuffix = id ?? intent;
  const scheduleOptions = schedules.map((schedule) => ({
    label: schedule.name,
    value: schedule.id,
  }));

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
        {values.isSpecialPrice ? (
          <GuardedSelectField
            fieldId={`price-schedule-${fieldIdSuffix}`}
            form={form}
            guard={guard}
            label="Cronograma"
            name="scheduleId"
            options={scheduleOptions}
            placeholder="Elegí un cronograma"
            value={values.scheduleId}
          />
        ) : (
          <input type="hidden" name="scheduleId" value="" />
        )}
        <GuardedDeadlineField
          fieldId={`price-payment-deadline-${fieldIdSuffix}`}
          form={form}
          guard={guard}
          isExistingRow={Boolean(id)}
          name="paymentDeadline"
          value={values.paymentDeadline}
        />
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <GuardedSelectField
            fieldId={`price-group-type-${fieldIdSuffix}`}
            form={form}
            guard={guard}
            label="Tipo de grupo"
            name="groupType"
            options={groupTypeOptions}
            placeholder="Elegí un tipo"
            value={values.groupType}
          />
          <GuardedAmountField
            fieldId={`price-amount-${fieldIdSuffix}`}
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

export function PriceFormActions({
  form,
  formId,
  pendingScope,
}: {
  form: PriceFormController;
  formId: string;
  pendingScope: RouteFormPendingScope;
}) {
  return (
    <EventBasesFormActions
      basePath={basePath}
      control={form.control}
      formId={formId}
      pendingScope={pendingScope}
    />
  );
}

export function PriceFormPanel({ children }: { children: ReactNode }) {
  return <AdminResourceFormCard>{children}</AdminResourceFormCard>;
}

function NameField({
  canEditStructure,
  form,
}: {
  canEditStructure: boolean;
  form: PriceFormController;
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
                <SpecialPriceSwitch form={form} disabled={!canEditStructure} />
              </div>
            </div>
          )}
        />
      )}
    </SharedFieldLayout>
  );
}

// The shape of the form's switch: a hidden input so the boolean reaches the
// action, a tooltip on the control, and a side effect on the field the toggle
// governs. `onToggle` receives the new state, because clearing the partner
// field only makes sense on one edge.
type PriceFormSwitchProps = {
  disabled?: boolean;
  form: PriceFormController;
  label: string;
  name: "isSpecialPrice";
  onToggle: (checked: boolean) => void;
};

function PriceFormSwitch({
  disabled = false,
  form,
  label,
  name,
  onToggle,
}: PriceFormSwitchProps) {
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
                    onToggle(checked);
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

function SpecialPriceSwitch({
  disabled,
  form,
}: {
  disabled: boolean;
  form: PriceFormController;
}) {
  return (
    <PriceFormSwitch
      disabled={disabled}
      form={form}
      label="Precio especial"
      name="isSpecialPrice"
      onToggle={(checked) => {
        if (!checked) {
          form.setValue("scheduleId", EMPTY_SCHEDULE_VALUE, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
      }}
    />
  );
}

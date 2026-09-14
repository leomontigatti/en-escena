import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { SharedFieldLayout } from "@/components/shared/field-layout";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
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
import { SelectField } from "@/components/shared/select-field";

import { EventBasesFormActions } from "../events/bases-form-actions";
import {
  openEndedDeadlineLabel,
  EMPTY_SCHEDULE_VALUE,
  priceFormSchema,
  type PriceFormValues,
} from "./view-shared";
import { basePath } from "./shared";

type PriceFormController = UseFormReturn<PriceFormValues>;
type PriceFormProps = {
  amount?: number;
  formId?: string;
  groupType?: string;
  /** What the guards would refuse; a row being created is never guarded. */
  guard?: PriceGuard;
  id?: string;
  intent: string;
  name?: string | null;
  paymentDeadline?: string | null;
  scheduleId?: string | null;
  schedules: ScheduleListItem[];
  submittedValues?: PriceActionValues;
};
type PriceFormDefaultValueProps = Pick<
  PriceFormProps,
  | "amount"
  | "groupType"
  | "name"
  | "paymentDeadline"
  | "scheduleId"
  | "submittedValues"
>;

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

export function PriceForm({
  amount,
  formId,
  groupType,
  guard = openPriceGuard,
  id,
  intent,
  name,
  paymentDeadline,
  scheduleId,
  schedules,
  submittedValues,
}: PriceFormProps) {
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
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const values = form.watch();
  const fieldIdSuffix = id ?? intent;

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
          <ScheduleField
            fieldId={`price-schedule-${fieldIdSuffix}`}
            form={form}
            guard={guard}
            schedules={schedules}
            values={values}
          />
        ) : (
          <input type="hidden" name="scheduleId" value="" />
        )}
        <DeadlineField
          fieldId={`price-payment-deadline-${fieldIdSuffix}`}
          form={form}
          guard={guard}
          isExistingRow={Boolean(id)}
          values={values}
        />
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <GroupTypeField
            fieldId={`price-group-type-${fieldIdSuffix}`}
            form={form}
            guard={guard}
            values={values}
          />
          <AmountField
            fieldId={`price-amount-${fieldIdSuffix}`}
            form={form}
            guard={guard}
            values={values}
          />
        </FieldGroup>
      </FieldGroup>
    </form>
  );
}

/**
 * The structural fields read the same way as on the seminar price form: the
 * editable control while the guard allows the change, the shared read-only look
 * otherwise, with the value still travelling in the body so a save of the
 * fields that are open does not blank the ones that are locked.
 */
type GuardedFieldProps = {
  fieldId: string;
  form: PriceFormController;
  guard: PriceGuard;
  values: PriceFormValues;
};

function ScheduleField({
  fieldId,
  form,
  guard,
  schedules,
  values,
}: GuardedFieldProps & { schedules: ScheduleListItem[] }) {
  const options = schedules.map((schedule) => ({
    label: schedule.name,
    value: schedule.id,
  }));

  if (!guard.canEditStructure) {
    return (
      <ReadOnlySelectField
        id={fieldId}
        label="Cronograma"
        name="scheduleId"
        options={options}
        value={values.scheduleId}
      />
    );
  }

  return (
    <SelectField
      control={form.control}
      label="Cronograma"
      name="scheduleId"
      options={options}
      placeholder="Elegí un cronograma"
    />
  );
}

/**
 * An empty deadline reads differently on each form: a field still to fill in
 * while the price is being created, the row's own answer once it is saved.
 */
function DeadlineField({
  fieldId,
  form,
  guard,
  isExistingRow,
  values,
}: GuardedFieldProps & { isExistingRow: boolean }) {
  if (!guard.canEditStructure) {
    return (
      <ReadOnlyDateField
        id={fieldId}
        label="Fecha límite de pago"
        name="paymentDeadline"
        emptyLabel={openEndedDeadlineLabel}
        value={values.paymentDeadline || null}
      />
    );
  }

  return (
    <DateOnlyField
      clearable
      control={form.control}
      name="paymentDeadline"
      id={fieldId}
      label="Fecha límite de pago"
      placeholder={isExistingRow ? openEndedDeadlineLabel : undefined}
    />
  );
}

function GroupTypeField({ fieldId, form, guard, values }: GuardedFieldProps) {
  if (!guard.canEditStructure) {
    return (
      <ReadOnlySelectField
        id={fieldId}
        label="Tipo de grupo"
        name="groupType"
        options={groupTypeOptions}
        value={values.groupType}
      />
    );
  }

  return (
    <SelectField
      control={form.control}
      label="Tipo de grupo"
      name="groupType"
      options={groupTypeOptions}
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

export function PriceFormActions({
  formId,
  pendingScope,
}: {
  formId: string;
  pendingScope: RouteFormPendingScope;
}) {
  return (
    <EventBasesFormActions
      basePath={basePath}
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

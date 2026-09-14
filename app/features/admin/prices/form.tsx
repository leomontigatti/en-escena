import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { SharedFieldLayout } from "@/components/shared/field-layout";
import { GuardAlert } from "@/components/shared/guard-alert";
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
  type PriceGuard,
} from "./view-shared";
import { basePath } from "./shared";

type PriceFormController = UseFormReturn<PriceFormValues>;

const openGuard: PriceGuard = {
  canEditAmount: true,
  canEditStructure: true,
  canDelete: true,
  reason: null,
};

type PriceFormProps = {
  amount?: number;
  formId?: string;
  /** What the guards would refuse; a row being created is never guarded. */
  guard?: PriceGuard;
  groupType?: string;
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
  guard = openGuard,
  groupType,
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
      <PriceFields
        fieldPrefix={id ?? intent}
        form={form}
        guard={guard}
        isExistingRow={Boolean(id)}
        schedules={schedules}
        values={values}
      />
    </form>
  );
}

function PriceFields({
  fieldPrefix,
  form,
  guard,
  isExistingRow,
  schedules,
  values,
}: {
  fieldPrefix: string;
  form: PriceFormController;
  guard: PriceGuard;
  isExistingRow: boolean;
  schedules: ScheduleListItem[];
  values: PriceFormValues;
}) {
  const fieldProps = { form, guard, values };

  return (
    <FieldGroup>
      <NameField form={form} canEditStructure={guard.canEditStructure} />
      <ScheduleField
        {...fieldProps}
        fieldId={`price-schedule-${fieldPrefix}`}
        schedules={schedules}
      />
      <DeadlineField
        {...fieldProps}
        fieldId={`price-payment-deadline-${fieldPrefix}`}
        isExistingRow={isExistingRow}
      />
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <GroupTypeField
          {...fieldProps}
          fieldId={`price-group-type-${fieldPrefix}`}
        />
        <AmountField {...fieldProps} fieldId={`price-amount-${fieldPrefix}`} />
      </FieldGroup>
    </FieldGroup>
  );
}

/**
 * The guarded fields read the same way: the editable control while the guard
 * allows the change, the shared read-only look otherwise, with the value still
 * travelling in the body so a save of the fields that are open does not blank
 * the ones that are locked.
 */
type GuardedFieldProps = {
  fieldId: string;
  form: PriceFormController;
  guard: PriceGuard;
  values: PriceFormValues;
};

/**
 * The schedule only exists while the row is a special price, so a locked row
 * with no schedule keeps saying so through the same empty hidden input the
 * open form uses.
 */
function ScheduleField({
  fieldId,
  form,
  guard,
  schedules,
  values,
}: GuardedFieldProps & { schedules: ScheduleListItem[] }) {
  const scheduleOptions = schedules.map((schedule) => ({
    label: schedule.name,
    value: schedule.id,
  }));

  if (!values.isSpecialPrice) {
    return <input type="hidden" name="scheduleId" value="" />;
  }

  if (!guard.canEditStructure) {
    return (
      <ReadOnlySelectField
        id={fieldId}
        label="Cronograma"
        name="scheduleId"
        options={scheduleOptions}
        value={values.scheduleId}
      />
    );
  }

  return (
    <SelectField
      control={form.control}
      label="Cronograma"
      name="scheduleId"
      options={scheduleOptions}
      placeholder="Elegí un cronograma"
    />
  );
}

/**
 * The deadline reads the guard like its siblings, and one thing more: what an
 * empty control means. On a new row it is a field still to fill in, on a saved
 * one it is the answer the row already gives — no deadline.
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

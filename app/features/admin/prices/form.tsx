import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { SharedFieldLayout } from "@/components/shared/field-layout";
import { IntegerInputField } from "@/components/shared/integer-input-field";
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
  basePriceDeadlineLabel,
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
      isBasePrice: submittedValues.isBasePrice === "true",
      groupType: submittedValues.groupType,
      amount: submittedValues.amount,
      paymentDeadline: submittedValues.paymentDeadline,
      scheduleId: submittedValues.scheduleId || EMPTY_SCHEDULE_VALUE,
    };
  }

  return {
    name: name ?? "",
    isSpecialPrice: Boolean(scheduleId),
    isBasePrice: paymentDeadline === null,
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

  const isSpecialPrice = form.watch("isSpecialPrice");
  const isBasePrice = form.watch("isBasePrice");

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
        <NameField form={form} />
        {isSpecialPrice ? (
          <SelectField
            control={form.control}
            label="Cronograma"
            name="scheduleId"
            options={schedules.map((schedule) => ({
              label: schedule.name,
              value: schedule.id,
            }))}
            placeholder="Elegí un cronograma"
          />
        ) : (
          <input type="hidden" name="scheduleId" value="" />
        )}
        <DateOnlyField
          control={form.control}
          name="paymentDeadline"
          disabled={isBasePrice}
          id={`price-payment-deadline-${id ?? intent}`}
          label="Fecha límite de pago"
          labelAdornment={<BasePriceSwitch form={form} />}
        />
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            label="Tipo de grupo"
            name="groupType"
            options={groupTypeOptions}
            placeholder="Elegí un tipo"
          />
          <IntegerInputField
            control={form.control}
            label="Monto"
            min="1"
            name="amount"
            step="1"
          />
        </FieldGroup>
      </FieldGroup>
    </form>
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

function NameField({ form }: { form: PriceFormController }) {
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
                <SpecialPriceSwitch form={form} />
              </div>
            </div>
          )}
        />
      )}
    </SharedFieldLayout>
  );
}

// One switch shape for both price toggles: hidden input so the boolean reaches
// the action, tooltip on the control, and a side effect on the field the toggle
// governs. `onToggle` receives the new state, because the two switches clear
// their partner field on opposite edges.
type PriceFormSwitchProps = {
  form: PriceFormController;
  label: string;
  name: "isBasePrice" | "isSpecialPrice";
  onToggle: (checked: boolean) => void;
};

function PriceFormSwitch({
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

// Turns the row into a base price: one with no deadline, which applies once
// every dated row has expired. It sits in the label row rather than inside the
// control, because `DateOnlyField`'s right edge already carries the calendar
// icon and, once disabled, the lock icon.
function BasePriceSwitch({ form }: { form: PriceFormController }) {
  return (
    <PriceFormSwitch
      form={form}
      label={basePriceDeadlineLabel}
      name="isBasePrice"
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

function SpecialPriceSwitch({ form }: { form: PriceFormController }) {
  return (
    <PriceFormSwitch
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

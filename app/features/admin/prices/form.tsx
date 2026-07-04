import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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
  paymentDeadline?: string;
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
          id={`price-payment-deadline-${id ?? intent}`}
          label="Fecha límite de pago"
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
  const errorId = `${id}-error`;
  const error = form.formState.errors.name?.message;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Nombre</FieldLabel>
      <Controller
        control={form.control}
        name="name"
        render={({ field }) => (
          <div className="relative">
            <Input
              id={id}
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
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
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

function SpecialPriceSwitch({ form }: { form: PriceFormController }) {
  const id = useId();

  return (
    <Controller
      control={form.control}
      name="isSpecialPrice"
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
                  aria-label="Precio especial"
                  className={cn(
                    "border-border shadow-xs",
                    field.value ? "!bg-primary" : "!bg-muted",
                  )}
                  checked={field.value}
                  onBlur={field.onBlur}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);

                    if (!checked) {
                      form.setValue("scheduleId", EMPTY_SCHEDULE_VALUE, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>Precio especial</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
    />
  );
}

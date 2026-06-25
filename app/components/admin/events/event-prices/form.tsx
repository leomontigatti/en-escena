import { Link } from "react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useMemo, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { SubmitButton } from "@/components/shared/action-buttons";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PriceActionValues } from "@/lib/admin/events/bases-action.server";
import { buildPriceListPath } from "@/lib/admin/events/event-bases-navigation";
import { groupTypeOptions } from "@/lib/events/group-types";
import type { ScheduleListItem } from "@/lib/events/bases.server";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  type RouteFormPendingScope,
  useApplyServerFieldErrors,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";

import {
  EMPTY_SCHEDULE_VALUE,
  emptyPriceFieldErrors,
  priceFormSchema,
  type PriceFormValues,
} from "./shared";

type PriceTextFieldName = "amount";
type PriceSelectFieldName = "groupType" | "scheduleId";
type PriceFormController = UseFormReturn<PriceFormValues>;

export function PriceForm({
  amount,
  fieldErrors = emptyPriceFieldErrors,
  formId,
  groupType,
  id,
  intent,
  name,
  paymentDeadline,
  scheduleId,
  schedules,
  submittedValues,
}: {
  amount?: number;
  fieldErrors?: Record<string, string>;
  formId?: string;
  groupType?: string;
  id?: string;
  intent: string;
  name?: string | null;
  paymentDeadline?: string;
  scheduleId?: string | null;
  schedules: ScheduleListItem[];
  submittedValues?: PriceActionValues;
}) {
  const defaultValues = useMemo(
    () =>
      submittedValues
        ? {
            name: submittedValues.name,
            isSpecialPrice:
              submittedValues.isSpecialPrice === "true" ||
              submittedValues.scheduleId.length > 0,
            groupType: submittedValues.groupType,
            amount: submittedValues.amount,
            paymentDeadline: submittedValues.paymentDeadline,
            scheduleId: submittedValues.scheduleId || EMPTY_SCHEDULE_VALUE,
          }
        : {
            name: name ?? "",
            isSpecialPrice: Boolean(scheduleId),
            groupType: groupType ?? "",
            amount: amount ? String(amount) : "",
            paymentDeadline: paymentDeadline ?? "",
            scheduleId: scheduleId ?? EMPTY_SCHEDULE_VALUE,
          },
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

  useApplyServerFieldErrors(form, fieldErrors);

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
            form={form}
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
        <Controller
          control={form.control}
          name="paymentDeadline"
          render={({ field }) => (
            <DateOnlyField
              id={`price-payment-deadline-${id ?? intent}`}
              label="Fecha límite de pago"
              name="paymentDeadline"
              defaultValue={paymentDeadline ?? ""}
              value={field.value}
              onBlur={field.onBlur}
              onValueChange={field.onChange}
              error={form.formState.errors.paymentDeadline?.message}
            />
          )}
        />
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <SelectField
            form={form}
            label="Tipo de grupo"
            name="groupType"
            options={groupTypeOptions}
            placeholder="Elegí un tipo"
          />
          <TextField
            form={form}
            label="Monto"
            min="1"
            name="amount"
            step="1"
            type="number"
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
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, pendingScope);

  return (
    <div className="flex justify-end gap-2">
      <Button asChild variant="outline">
        <Link to={buildPriceListPath(null)}>Volver</Link>
      </Button>
      <SubmitButton form={formId} isPending={isPending} />
    </div>
  );
}

export function PriceFormPanel({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
    </Card>
  );
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

function TextField({
  className,
  form,
  label,
  name,
  ...inputProps
}: {
  className?: string;
  form: PriceFormController;
  label: string;
  name: PriceTextFieldName;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "form" | "name">) {
  const id = useId();
  const errorId = `${id}-error`;
  const error = form.formState.errors[name]?.message;

  return (
    <Field className={className} data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Input
            id={id}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            {...inputProps}
            {...field}
          />
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
                  className={`border-border shadow-xs ${
                    field.value ? "!bg-primary" : "!bg-muted"
                  }`}
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

function SelectField({
  className,
  form,
  label,
  name,
  options,
  placeholder,
  submitValue = (value) => value,
}: {
  className?: string;
  form: PriceFormController;
  label: string;
  name: PriceSelectFieldName;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  submitValue?: (value: string) => string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const error = form.formState.errors[name]?.message;

  return (
    <Field className={className} data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <>
            <input
              type="hidden"
              name={field.name}
              value={submitValue(field.value)}
            />
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id={id}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                className="w-full"
                onBlur={field.onBlur}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </>
        )}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

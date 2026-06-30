import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, type Control, useForm } from "react-hook-form";
import { Link, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInput } from "@/components/shared/integer-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { paymentMethodOptions } from "@/features/admin/academies/account-current/shared";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useApplyServerFieldErrors,
  useOptionalNavigation,
} from "@/lib/shared/forms";

import {
  createPaymentIntent,
  createPaymentSchema,
  type CreatePaymentActionData,
  type CreatePaymentFieldName,
  type CreatePaymentFormValues,
  type CreatePaymentSubmissionValues,
} from "./shared";
import type { loadAdminPaymentCreate } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadAdminPaymentCreate>>;
type CreatePaymentControl = Control<
  CreatePaymentFormValues,
  unknown,
  CreatePaymentSubmissionValues
>;

type AdministracionPagosNuevoRouteViewProps = {
  actionData?: CreatePaymentActionData;
  loaderData: LoaderData;
};

export function AdministracionPagosNuevoRouteView({
  actionData,
  loaderData,
}: AdministracionPagosNuevoRouteViewProps) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: createPaymentIntent,
  });
  const values = actionData?.values ?? loaderData.values;
  const fieldErrors = actionData?.fieldErrors ?? {};
  const form = useForm<
    CreatePaymentFormValues,
    unknown,
    CreatePaymentSubmissionValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(createPaymentSchema),
  });
  const submit = useSubmit();
  const { reset } = form;
  const resetKey = JSON.stringify(values);

  useEffect(() => {
    reset(values);
  }, [reset, resetKey, values]);

  useApplyServerFieldErrors(form, fieldErrors);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo pago"
      description="Registrá un pago recibido para una academia dentro del evento activo."
      eventRequiredEmptyState={{
        title: "No hay un evento activo para registrar pagos",
        description: "Activá un evento para registrar pagos recibidos.",
      }}
    >
      <form
        method="post"
        noValidate
        onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
      >
        <input type="hidden" name="intent" value={createPaymentIntent} />
        <AdminResourceFormCard
          contentClassName="gap-5"
          footer={
            <>
              <Button asChild variant="outline">
                <Link to={getPaymentsListUrl(loaderData.selectedEventId)}>
                  Volver
                </Link>
              </Button>
              <SubmitButton isPending={isPending} />
            </>
          }
        >
          {actionData?.status === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>No pudimos registrar el pago</AlertTitle>
              <AlertDescription>{actionData.message}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <AcademyField
              academies={loaderData.academies}
              control={form.control}
            />
            <PaymentFields control={form.control} />
          </FieldGroup>
        </AdminResourceFormCard>
      </form>
    </AdminResourceLayout>
  );
}

function AcademyField({
  academies,
  control,
}: {
  academies: LoaderData["academies"];
  control: CreatePaymentControl;
}) {
  const anchorRef = useComboboxAnchor();

  return (
    <Controller<CreatePaymentFormValues, "academyId">
      control={control}
      name="academyId"
      render={({ field, fieldState }) => (
        <Field
          className="md:col-span-2"
          data-invalid={fieldState.error ? true : undefined}
          orientation="vertical"
        >
          <FieldLabel htmlFor="academy-id">Academia</FieldLabel>
          <FieldContent>
            <input type="hidden" name={field.name} value={field.value} />
            <Combobox
              items={academies.map((academy) => academy.id)}
              itemToStringLabel={(academyId) =>
                getAcademyLabel(academies, academyId)
              }
              itemToStringValue={(academyId) =>
                getAcademyLabel(academies, academyId)
              }
              value={field.value}
              onValueChange={field.onChange}
              defaultValue={field.value}
            >
              <ComboboxTrigger
                render={
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    <ComboboxValue />
                  </Button>
                }
              />
              <ComboboxContent anchor={anchorRef}>
                <ComboboxInput
                  id="academy-id"
                  aria-invalid={fieldState.error ? true : undefined}
                  placeholder="Buscar"
                  showTrigger={false}
                  onBlur={field.onBlur}
                />
                <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
                <ComboboxList>
                  {(academyId) => (
                    <ComboboxItem key={academyId} value={academyId}>
                      {getAcademyLabel(academies, academyId)}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function PaymentFields({ control }: { control: CreatePaymentControl }) {
  return (
    <>
      <Controller<CreatePaymentFormValues, "paymentDate">
        control={control}
        name="paymentDate"
        render={({ field, fieldState }) => (
          <DateOnlyField
            className="md:col-start-1"
            defaultValue={field.value}
            error={fieldState.error?.message}
            id="payment-date"
            label="Fecha de pago"
            name={field.name}
            onBlur={field.onBlur}
            onValueChange={field.onChange}
            value={field.value}
          />
        )}
      />

      <PaymentTextField
        className="md:col-start-2"
        control={control}
        label="Referencia"
        name="reference"
      />

      <PaymentTextField
        className="md:col-start-1"
        control={control}
        label="Monto"
        min="1"
        name="amount"
        step="1"
      />

      <PaymentMethodField className="md:col-start-2" control={control} />

      <PaymentTextareaField
        className="md:col-span-2"
        control={control}
        label="Nota interna"
        name="internalNote"
      />
    </>
  );
}

function PaymentTextField({
  className,
  control,
  label,
  name,
  ...inputProps
}: {
  className?: string;
  control: CreatePaymentControl;
  label: string;
  name: Extract<CreatePaymentFieldName, "amount" | "reference">;
} & Omit<
  React.ComponentProps<typeof Input>,
  "defaultValue" | "name" | "onBlur" | "onChange" | "value"
>) {
  const id = `payment-${name}`;
  const errorId = `${id}-error`;

  return (
    <Controller<CreatePaymentFormValues, typeof name>
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          className={className}
          data-invalid={fieldState.error ? true : undefined}
          orientation="vertical"
        >
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            {name === "amount" ? (
              <IntegerInput
                id={id}
                aria-describedby={fieldState.error ? errorId : undefined}
                aria-invalid={fieldState.error ? true : undefined}
                {...inputProps}
                {...field}
                value={field.value ?? ""}
              />
            ) : (
              <Input
                id={id}
                aria-describedby={fieldState.error ? errorId : undefined}
                aria-invalid={fieldState.error ? true : undefined}
                {...inputProps}
                {...field}
                value={field.value ?? ""}
              />
            )}
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function PaymentMethodField({
  className,
  control,
}: {
  className?: string;
  control: CreatePaymentControl;
}) {
  return (
    <Controller<CreatePaymentFormValues, "paymentMethod">
      control={control}
      name="paymentMethod"
      render={({ field, fieldState }) => (
        <Field
          className={className}
          data-invalid={fieldState.error ? true : undefined}
          orientation="vertical"
        >
          <FieldLabel htmlFor="payment-method">Medio de pago</FieldLabel>
          <FieldContent>
            <Select
              name={field.name}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger
                id="payment-method"
                aria-invalid={fieldState.error ? true : undefined}
                className="w-full"
              >
                <SelectValue placeholder="Seleccioná un medio de pago" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethodOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function PaymentTextareaField({
  className,
  control,
  label,
  name,
}: {
  className?: string;
  control: CreatePaymentControl;
  label: string;
  name: "internalNote";
}) {
  const id = `payment-${name}`;
  const errorId = `${id}-error`;

  return (
    <Controller<CreatePaymentFormValues, typeof name>
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          className={className}
          data-invalid={fieldState.error ? true : undefined}
          orientation="vertical"
        >
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Textarea
              id={id}
              aria-describedby={fieldState.error ? errorId : undefined}
              aria-invalid={fieldState.error ? true : undefined}
              {...field}
              value={field.value ?? ""}
            />
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function getPaymentsListUrl(selectedEventId: string | null) {
  return selectedEventId
    ? `/administracion/pagos?evento=${selectedEventId}`
    : "/administracion/pagos";
}

function getAcademyLabel(
  academies: LoaderData["academies"],
  academyId: string,
) {
  return (
    academies.find((academy) => academy.id === academyId)?.name ?? academyId
  );
}

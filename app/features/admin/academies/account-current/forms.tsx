import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { Controller, type Control, useForm } from "react-hook-form";
import { useSubmit } from "react-router";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInput } from "@/components/shared/integer-input-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  createValidatedRouteFormDataSubmitHandler,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";

import { formatAmount, formatDate } from "./formatters";
import {
  defaultIssueDepositInvoicesValues,
  defaultPaymentImputationValues,
  defaultRegisterPaymentValues,
  paymentMethodOptions,
  registerPaymentSchema,
  type PaymentFieldName,
  type RegisterPaymentFormValues,
  type RegisterPaymentSubmissionValues,
} from "./shared";
import type { AccountCurrentLoaderData } from "./types";

export { BalanceInvoiceForm } from "./balance-invoice-form";
export { CorrectionActionsForm } from "./correction-actions-form";

type RegisterPaymentControl = Control<
  RegisterPaymentFormValues,
  unknown,
  RegisterPaymentSubmissionValues
>;

export function PaymentForm({
  fieldErrors,
  values,
}: {
  fieldErrors: Partial<Record<string, string>>;
  values: ReturnType<typeof defaultRegisterPaymentValues>;
}) {
  const form = useForm<
    RegisterPaymentFormValues,
    unknown,
    RegisterPaymentSubmissionValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(registerPaymentSchema),
  });
  const submit = useSubmit();
  const { reset } = form;
  const resetKey = JSON.stringify(values);

  useEffect(() => {
    reset(values);
  }, [reset, resetKey, values]);

  useApplyServerFieldErrors(form, fieldErrors);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar pago</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          className="flex flex-col gap-5"
          noValidate
          onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
        >
          <input type="hidden" name="intent" value="register-payment" />
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Controller<RegisterPaymentFormValues, "paymentDate">
              control={form.control}
              name="paymentDate"
              render={({ field, fieldState }) => (
                <DateOnlyField
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

            <RegisterPaymentTextField
              control={form.control}
              label="Monto"
              min="1"
              name="amount"
              step="1"
            />

            <RegisterPaymentMethodField control={form.control} />

            <RegisterPaymentTextField
              control={form.control}
              label="Referencia"
              name="reference"
            />

            <RegisterPaymentTextareaField
              className="md:col-span-2"
              control={form.control}
              label="Nota interna"
              name="internalNote"
            />
          </FieldGroup>

          <div className="flex justify-end">
            <Button type="submit">Registrar pago</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function RegisterPaymentTextField({
  control,
  label,
  name,
  ...inputProps
}: {
  control: RegisterPaymentControl;
  label: string;
  name: Extract<PaymentFieldName, "amount" | "reference">;
} & Omit<
  React.ComponentProps<typeof Input>,
  "defaultValue" | "name" | "onBlur" | "onChange" | "value"
>) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<RegisterPaymentFormValues, typeof name>
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
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

function RegisterPaymentMethodField({
  control,
}: {
  control: RegisterPaymentControl;
}) {
  const id = useId();

  return (
    <Controller<RegisterPaymentFormValues, "paymentMethod">
      control={control}
      name="paymentMethod"
      render={({ field, fieldState }) => (
        <Field
          data-invalid={fieldState.error ? true : undefined}
          orientation="vertical"
        >
          <FieldLabel htmlFor={id}>Medio de pago</FieldLabel>
          <FieldContent>
            <Select
              name={field.name}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger
                id={id}
                aria-invalid={fieldState.error ? true : undefined}
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

function RegisterPaymentTextareaField({
  className,
  control,
  label,
  name,
}: {
  className?: string;
  control: RegisterPaymentControl;
  label: string;
  name: "internalNote";
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller<RegisterPaymentFormValues, typeof name>
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

export function PaymentImputationForm({
  fieldErrors,
  invoices,
  payments,
  values,
}: {
  fieldErrors: Partial<Record<string, string>>;
  invoices: Array<
    | AccountCurrentLoaderData["activeDepositInvoices"][number]
    | AccountCurrentLoaderData["activeBalanceInvoices"][number]
  >;
  payments: Array<AccountCurrentLoaderData["payments"][number]>;
  values: ReturnType<typeof defaultPaymentImputationValues>;
}) {
  const amountId = useId();
  const invoiceId = useId();
  const paymentId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imputar pago</CardTitle>
      </CardHeader>
      <CardContent>
        <form method="post" className="flex flex-col gap-5" noValidate>
          <input type="hidden" name="intent" value="impute-payment" />
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field
              data-invalid={fieldErrors.paymentId ? true : undefined}
              orientation="vertical"
            >
              <FieldLabel htmlFor={paymentId}>Pago</FieldLabel>
              <FieldContent>
                <Select name="paymentId" defaultValue={values.paymentId}>
                  <SelectTrigger id={paymentId}>
                    <SelectValue placeholder="Seleccioná un Pago" />
                  </SelectTrigger>
                  <SelectContent>
                    {payments.map((payment) => (
                      <SelectItem key={payment.id} value={payment.id}>
                        {`N° ${payment.paymentNumber} · Disponible ${formatAmount(payment.availableAmount)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{fieldErrors.paymentId}</FieldError>
              </FieldContent>
            </Field>

            <Field
              data-invalid={fieldErrors.invoiceId ? true : undefined}
              orientation="vertical"
            >
              <FieldLabel htmlFor={invoiceId}>Factura</FieldLabel>
              <FieldContent>
                <Select name="invoiceId" defaultValue={values.invoiceId}>
                  <SelectTrigger id={invoiceId}>
                    <SelectValue placeholder="Seleccioná una factura" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices.map((invoice) => (
                      <SelectItem key={invoice.id} value={invoice.id}>
                        {`N° ${invoice.invoiceNumber} · ${invoice.choreographyName} · Pendiente ${formatAmount(invoice.pendingAmount)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{fieldErrors.invoiceId}</FieldError>
              </FieldContent>
            </Field>

            <DateOnlyField
              defaultValue={values.imputationDate}
              error={fieldErrors.imputationDate}
              id="imputation-date"
              label="Fecha de imputación"
              name="imputationDate"
            />

            <Field
              data-invalid={fieldErrors.amount ? true : undefined}
              orientation="vertical"
            >
              <FieldLabel htmlFor={amountId}>Monto</FieldLabel>
              <FieldContent>
                <IntegerInput
                  id={amountId}
                  name="amount"
                  min="1"
                  step="1"
                  defaultValue={values.amount}
                />
                <FieldError>{fieldErrors.amount}</FieldError>
              </FieldContent>
            </Field>
          </FieldGroup>

          <div className="flex justify-end">
            <Button type="submit">Imputar pago</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function DepositInvoiceForm({
  candidates,
  fieldErrors,
  values,
}: {
  candidates: AccountCurrentLoaderData["depositInvoiceCandidates"];
  fieldErrors: Partial<Record<string, string>>;
  values: ReturnType<typeof defaultIssueDepositInvoicesValues>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Emitir factura de seña</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {candidates.length > 0 ? (
          <form method="post" className="flex flex-col gap-5" noValidate>
            <input type="hidden" name="intent" value="issue-deposit-invoices" />
            <FieldGroup className="grid gap-5 md:grid-cols-[minmax(0,16rem)_1fr]">
              <DateOnlyField
                defaultValue={values.issueDate}
                error={fieldErrors.issueDate}
                id="invoice-issue-date"
                label="Fecha de emisión"
                name="issueDate"
              />
            </FieldGroup>

            <Field
              data-invalid={fieldErrors.choreographyIds ? true : undefined}
              orientation="vertical"
            >
              <FieldLabel>Coreografías sin seña activa</FieldLabel>
              <FieldContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Sel.</TableHead>
                        <TableHead>Coreografía</TableHead>
                        <TableHead>Modalidad</TableHead>
                        <TableHead>Creada</TableHead>
                        <TableHead>Vence</TableHead>
                        <TableHead className="text-right">
                          Base estimada
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidates.map((candidate) => {
                        const checked = values.choreographyIds.includes(
                          candidate.id,
                        );

                        return (
                          <TableRow key={candidate.id}>
                            <TableCell>
                              <Checkbox
                                aria-label={`Seleccionar ${candidate.name}`}
                                defaultChecked={checked}
                                name="choreographyIds"
                                value={candidate.id}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {candidate.name}
                            </TableCell>
                            <TableCell>{candidate.modalityLabel}</TableCell>
                            <TableCell>
                              {formatDate(candidate.createdOn)}
                            </TableCell>
                            <TableCell>
                              {candidate.selectedPaymentDeadline
                                ? formatDate(candidate.selectedPaymentDeadline)
                                : "Sin vencimiento"}
                            </TableCell>
                            <TableCell className="text-right">
                              {candidate.estimatedBasePriceAmount === null
                                ? "Pendiente"
                                : formatAmount(
                                    candidate.estimatedBasePriceAmount,
                                  )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <FieldError>{fieldErrors.choreographyIds}</FieldError>
              </FieldContent>
            </Field>

            <div className="flex justify-end">
              <Button type="submit">Emitir factura de seña</Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay Coreografías elegibles para emitir una seña nueva.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

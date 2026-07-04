import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { Controller, type Control, useForm } from "react-hook-form";
import { useSubmit } from "react-router";

import { DateOnlyField } from "@/components/shared/date-only-field";
import {
  IntegerInput,
  IntegerInputField,
} from "@/components/shared/integer-input-field";
import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
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
  useResetFormValues,
} from "@/lib/shared/forms";

import { formatAmount, formatDate } from "./formatters";
import {
  defaultIssueDepositInvoicesValues,
  defaultPaymentImputationValues,
  defaultRegisterPaymentValues,
  issueDepositInvoicesSchema,
  paymentMethodOptions,
  paymentImputationSchema,
  registerPaymentSchema,
  type IssueDepositInvoicesFormValues,
  type PaymentFieldName,
  type PaymentImputationFormValues,
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
  values,
}: {
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
  useResetFormValues(form.reset, values);

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
            <DateOnlyField
              control={form.control}
              name="paymentDate"
              id="payment-date"
              label="Fecha de pago"
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
                <SelectGroup>
                  {paymentMethodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
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
  invoices,
  payments,
  values,
}: {
  invoices: Array<
    | AccountCurrentLoaderData["activeDepositInvoices"][number]
    | AccountCurrentLoaderData["activeBalanceInvoices"][number]
  >;
  payments: Array<AccountCurrentLoaderData["payments"][number]>;
  values: ReturnType<typeof defaultPaymentImputationValues>;
}) {
  const form = useForm<PaymentImputationFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(paymentImputationSchema),
  });
  const submit = useSubmit();
  useResetFormValues(form.reset, values);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imputar pago</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          className="flex flex-col gap-5"
          noValidate
          onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
        >
          <input type="hidden" name="intent" value="impute-payment" />
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <SelectField
              control={form.control}
              id="payment-imputation-payment"
              label="Pago"
              name="paymentId"
              options={payments.map((payment) => ({
                label: `N° ${payment.paymentNumber} · Disponible ${formatAmount(payment.availableAmount)}`,
                value: payment.id,
              }))}
              placeholder="Seleccioná un Pago"
            />

            <SelectField
              control={form.control}
              id="payment-imputation-invoice"
              label="Factura"
              name="invoiceId"
              options={invoices.map((invoice) => ({
                label: `N° ${invoice.invoiceNumber} · ${invoice.choreographyName} · Pendiente ${formatAmount(invoice.pendingAmount)}`,
                value: invoice.id,
              }))}
              placeholder="Seleccioná una factura"
            />

            <DateOnlyField
              control={form.control}
              id="imputation-date"
              label="Fecha de imputación"
              name="imputationDate"
            />

            <IntegerInputField
              control={form.control}
              id="payment-imputation-amount"
              label="Monto"
              min="1"
              name="amount"
              step="1"
            />
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
  values,
}: {
  candidates: AccountCurrentLoaderData["depositInvoiceCandidates"];
  values: ReturnType<typeof defaultIssueDepositInvoicesValues>;
}) {
  const form = useForm<IssueDepositInvoicesFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(issueDepositInvoicesSchema),
  });
  const submit = useSubmit();
  useResetFormValues(form.reset, values);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emitir factura de seña</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {candidates.length > 0 ? (
          <form
            method="post"
            className="flex flex-col gap-5"
            noValidate
            onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
          >
            <input type="hidden" name="intent" value="issue-deposit-invoices" />
            <FieldGroup className="grid gap-5 md:grid-cols-[minmax(0,16rem)_1fr]">
              <DateOnlyField
                control={form.control}
                id="invoice-issue-date"
                label="Fecha de emisión"
                name="issueDate"
              />
            </FieldGroup>

            <Controller<IssueDepositInvoicesFormValues, "choreographyIds">
              control={form.control}
              name="choreographyIds"
              render={({ field, fieldState }) => {
                const selectedIds = Array.isArray(field.value)
                  ? field.value
                  : [];
                const isInvalid = Boolean(fieldState.error);

                return (
                  <FieldSet
                    data-invalid={isInvalid ? true : undefined}
                    onBlur={field.onBlur}
                  >
                    <FieldLegend variant="label">
                      Coreografías sin seña activa
                    </FieldLegend>
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
                              const checked = selectedIds.includes(
                                candidate.id,
                              );

                              return (
                                <TableRow key={candidate.id}>
                                  <TableCell>
                                    <Checkbox
                                      aria-invalid={
                                        isInvalid ? true : undefined
                                      }
                                      aria-label={`Seleccionar ${candidate.name}`}
                                      checked={checked}
                                      name={field.name}
                                      value={candidate.id}
                                      onCheckedChange={(nextChecked) => {
                                        field.onChange(
                                          updateSelectedIds({
                                            checked: nextChecked === true,
                                            id: candidate.id,
                                            selectedIds,
                                          }),
                                        );
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {candidate.name}
                                  </TableCell>
                                  <TableCell>
                                    {candidate.modalityLabel}
                                  </TableCell>
                                  <TableCell>
                                    {formatDate(candidate.createdOn)}
                                  </TableCell>
                                  <TableCell>
                                    {candidate.selectedPaymentDeadline
                                      ? formatDate(
                                          candidate.selectedPaymentDeadline,
                                        )
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
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldContent>
                  </FieldSet>
                );
              }}
            />

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

function updateSelectedIds({
  checked,
  id,
  selectedIds,
}: {
  checked: boolean;
  id: string;
  selectedIds: string[];
}) {
  if (checked) {
    return selectedIds.includes(id) ? selectedIds : [...selectedIds, id];
  }

  return selectedIds.filter((selectedId) => selectedId !== id);
}

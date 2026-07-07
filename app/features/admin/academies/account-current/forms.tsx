import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useSubmit } from "react-router";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { SelectField } from "@/components/shared/select-field";
import { TextareaField } from "@/components/shared/textarea-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import {
  createValidatedRouteFormDataSubmitHandler,
  useResetFormValues,
} from "@/lib/shared/forms";

import { formatAmount } from "./formatters";
import {
  defaultPaymentImputationValues,
  defaultRegisterPaymentValues,
  paymentMethodOptions,
  paymentImputationSchema,
  registerPaymentSchema,
  type PaymentImputationFormValues,
  type RegisterPaymentFormValues,
  type RegisterPaymentSubmissionValues,
} from "./shared";
import type { AccountCurrentLoaderData } from "./types";

export { CorrectionActionsForm } from "./correction-actions-form";

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

            <IntegerInputField
              control={form.control}
              label="Monto"
              min="1"
              name="amount"
              step="1"
            />

            <SelectField
              control={form.control}
              label="Medio de pago"
              name="paymentMethod"
              options={paymentMethodOptions}
              placeholder="Seleccioná un medio de pago"
            />

            <TextInputField
              control={form.control}
              label="Referencia"
              name="reference"
            />

            <TextareaField
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

import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { formatAmount } from "./formatters";
import { defaultAccountCurrentCorrectionValues } from "./shared";
import type { AccountCurrentLoaderData } from "./types";

export function CorrectionActionsForm({
  fieldErrors,
  invoices,
  imputations,
  payments,
  values,
}: {
  fieldErrors: Partial<Record<string, string>>;
  invoices: Array<AccountCurrentLoaderData["activeDepositInvoices"][number]>;
  imputations: Array<AccountCurrentLoaderData["imputations"][number]>;
  payments: Array<AccountCurrentLoaderData["payments"][number]>;
  values: ReturnType<typeof defaultAccountCurrentCorrectionValues>;
}) {
  if (
    invoices.length === 0 &&
    imputations.length === 0 &&
    payments.length === 0
  ) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Correcciones administrativas</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-3">
        {imputations.length > 0 ? (
          <CorrectionForm
            buttonLabel="Anular imputación"
            fieldErrors={fieldErrors}
            intent="annul-imputation"
            optionLabel="Imputación"
            options={imputations.map((imputation) => ({
              label: `Pago N° ${imputation.paymentNumber} · Factura N° ${imputation.invoiceNumber} · ${imputation.choreographyName}`,
              value: imputation.id,
            }))}
            reasonValue={values.reason}
            selectName="imputationId"
            selectedValue={values.imputationId}
          />
        ) : null}

        {invoices.length > 0 ? (
          <CorrectionForm
            buttonLabel="Cancelar factura"
            fieldErrors={fieldErrors}
            intent="cancel-invoice"
            optionLabel="Factura"
            options={invoices.map((invoice) => ({
              label: `N° ${invoice.invoiceNumber} · ${invoice.choreographyName}`,
              value: invoice.id,
            }))}
            reasonValue={values.reason}
            selectName="invoiceId"
            selectedValue={values.invoiceId}
          />
        ) : null}

        {payments.length > 0 ? (
          <CorrectionForm
            buttonLabel="Anular pago"
            fieldErrors={fieldErrors}
            intent="annul-payment"
            optionLabel="Pago"
            options={payments.map((payment) => ({
              label: `N° ${payment.paymentNumber} · ${formatAmount(payment.amount)}`,
              value: payment.id,
            }))}
            reasonValue={values.reason}
            selectName="paymentId"
            selectedValue={values.paymentId}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function CorrectionForm({
  buttonLabel,
  fieldErrors,
  intent,
  optionLabel,
  options,
  reasonValue,
  selectedValue,
  selectName,
}: {
  buttonLabel: string;
  fieldErrors: Partial<Record<string, string>>;
  intent: "annul-imputation" | "annul-payment" | "cancel-invoice";
  optionLabel: string;
  options: Array<{ label: string; value: string }>;
  reasonValue: string;
  selectedValue: string;
  selectName: "imputationId" | "invoiceId" | "paymentId";
}) {
  const selectId = useId();
  const reasonId = useId();
  const selectError = fieldErrors[selectName];
  const reasonError = fieldErrors.reason;

  return (
    <form method="post" className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="intent" value={intent} />
      <Field
        data-invalid={selectError ? true : undefined}
        orientation="vertical"
      >
        <FieldLabel htmlFor={selectId}>{optionLabel}</FieldLabel>
        <FieldContent>
          <Select name={selectName} defaultValue={selectedValue}>
            <SelectTrigger
              id={selectId}
              aria-invalid={selectError ? true : undefined}
            >
              <SelectValue
                placeholder={`Seleccioná ${optionLabel.toLowerCase()}`}
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{selectError}</FieldError>
        </FieldContent>
      </Field>

      <Field
        data-invalid={reasonError ? true : undefined}
        orientation="vertical"
      >
        <FieldLabel htmlFor={reasonId}>Motivo</FieldLabel>
        <FieldContent>
          <Textarea
            id={reasonId}
            name="reason"
            defaultValue={reasonValue}
            aria-invalid={reasonError ? true : undefined}
          />
          <FieldError>{reasonError}</FieldError>
        </FieldContent>
      </Field>

      <div className="flex justify-end">
        <Button type="submit" variant="outline">
          {buttonLabel}
        </Button>
      </div>
    </form>
  );
}

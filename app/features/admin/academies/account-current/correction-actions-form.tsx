import { useId } from "react";

import { SharedFieldLayout } from "@/components/shared/field-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { formatAmount } from "./formatters";
import { defaultAccountCurrentCorrectionValues } from "./shared";
import type { AccountCurrentLoaderData } from "./types";

export function CorrectionActionsForm({
  invoices,
  imputations,
  payments,
  values,
}: {
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
  intent,
  optionLabel,
  options,
  reasonValue,
  selectedValue,
  selectName,
}: {
  buttonLabel: string;
  intent: "annul-imputation" | "annul-payment" | "cancel-invoice";
  optionLabel: string;
  options: Array<{ label: string; value: string }>;
  reasonValue: string;
  selectedValue: string;
  selectName: "imputationId" | "invoiceId" | "paymentId";
}) {
  const selectId = useId();
  const reasonId = useId();

  return (
    <form method="post" className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="intent" value={intent} />
      <SharedFieldLayout id={selectId} label={optionLabel}>
        {({ describedBy, isInvalid }) => (
          <Select name={selectName} defaultValue={selectedValue}>
            <SelectTrigger
              id={selectId}
              aria-describedby={describedBy || undefined}
              aria-invalid={isInvalid ? true : undefined}
            >
              <SelectValue
                placeholder={`Seleccioná ${optionLabel.toLowerCase()}`}
              />
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
        )}
      </SharedFieldLayout>

      <SharedFieldLayout id={reasonId} label="Motivo">
        {({ describedBy, isInvalid }) => (
          <Textarea
            id={reasonId}
            name="reason"
            aria-describedby={describedBy || undefined}
            aria-invalid={isInvalid ? true : undefined}
            defaultValue={reasonValue}
          />
        )}
      </SharedFieldLayout>

      <div className="flex justify-end">
        <Button type="submit" variant="outline">
          {buttonLabel}
        </Button>
      </div>
    </form>
  );
}

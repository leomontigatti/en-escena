import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Control } from "react-hook-form";
import { useSubmit } from "react-router";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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

import { formatAmount } from "./formatters";
import {
  balanceInvoiceSchema,
  type BalanceInvoiceFormValues,
  defaultBalanceInvoiceValues,
  type BalanceInvoicePreviewData,
} from "./shared";
import type { AccountCurrentLoaderData } from "./types";

export function BalanceInvoiceForm({
  candidates,
  preview,
  values,
}: {
  candidates: AccountCurrentLoaderData["balanceInvoiceCandidates"];
  preview?: BalanceInvoicePreviewData;
  values: ReturnType<typeof defaultBalanceInvoiceValues>;
}) {
  const form = useForm<BalanceInvoiceFormValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(balanceInvoiceSchema),
  });
  const submit = useSubmit();
  useResetFormValues(form.reset, values);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emitir factura de saldo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {candidates.length > 0 ? (
          <>
            <form
              method="post"
              className="flex flex-col gap-5"
              noValidate
              onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
            >
              <input
                type="hidden"
                name="intent"
                value="preview-balance-invoice"
              />
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <SelectField
                  control={form.control}
                  id="balance-invoice-choreography"
                  label="Coreografía"
                  name="choreographyId"
                  options={candidates.map((candidate) => ({
                    label: candidate.name,
                    value: candidate.id,
                  }))}
                  placeholder="Seleccioná una Coreografía"
                />

                <DateOnlyField
                  control={form.control}
                  id="balance-invoice-issue-date"
                  label="Fecha de emisión"
                  name="issueDate"
                />

                <IntegerInputField
                  control={form.control}
                  id="balance-invoice-administrative-discount-amount"
                  label="Descuento administrativo"
                  min="0"
                  name="administrativeDiscountAmount"
                  step="1"
                />

                <BalanceInvoiceTextareaField
                  control={form.control}
                  id="balance-invoice-administrative-discount-internal-reason"
                  label="Motivo interno"
                  name="administrativeDiscountInternalReason"
                />

                <TextInputField
                  className="md:col-span-2"
                  control={form.control}
                  id="balance-invoice-administrative-discount-public-label"
                  label="Etiqueta pública opcional"
                  name="administrativeDiscountPublicLabel"
                />
              </FieldGroup>

              <div className="flex justify-end">
                <Button type="submit">Previsualizar factura de saldo</Button>
              </div>
            </form>

            {preview ? (
              <form method="post" className="flex flex-col gap-5" noValidate>
                <input
                  type="hidden"
                  name="intent"
                  value="issue-balance-invoice"
                />
                <input
                  type="hidden"
                  name="choreographyId"
                  value={values.choreographyId}
                />
                <input
                  type="hidden"
                  name="issueDate"
                  value={values.issueDate}
                />
                <input
                  type="hidden"
                  name="administrativeDiscountAmount"
                  value={values.administrativeDiscountAmount}
                />
                <input
                  type="hidden"
                  name="administrativeDiscountInternalReason"
                  value={values.administrativeDiscountInternalReason}
                />
                <input
                  type="hidden"
                  name="administrativeDiscountPublicLabel"
                  value={values.administrativeDiscountPublicLabel}
                />

                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Precio base congelado</TableCell>
                        <TableCell className="text-right">
                          {formatAmount(preview.basePriceAmount)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Seña aplicada</TableCell>
                        <TableCell className="text-right">
                          {formatAmount(preview.appliedDepositAmount)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Descuentos individuales</TableCell>
                        <TableCell className="text-right">
                          {formatAmount(preview.dancerDiscountAmount)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Descuento administrativo</TableCell>
                        <TableCell className="text-right">
                          {formatAmount(preview.administrativeDiscountAmount)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Total final</TableCell>
                        <TableCell className="text-right">
                          {formatAmount(preview.finalTotalAmount)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Importe factura de saldo</TableCell>
                        <TableCell className="text-right">
                          {formatAmount(preview.balanceAmount)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-end">
                  <Button type="submit">Confirmar factura de saldo</Button>
                </div>
              </form>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay Coreografías elegibles para emitir un saldo nuevo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BalanceInvoiceTextareaField({
  control,
  id,
  label,
  name,
}: {
  control: Control<BalanceInvoiceFormValues>;
  id: string;
  label: string;
  name: "administrativeDiscountInternalReason";
}) {
  const errorId = `${id}-error`;

  return (
    <Controller<BalanceInvoiceFormValues, typeof name>
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
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

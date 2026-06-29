import { useId } from "react";

import { DateOnlyField } from "@/components/shared/date-only-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

import { formatAmount } from "./formatters";
import {
  defaultBalanceInvoiceValues,
  type BalanceInvoicePreviewData,
} from "./shared";
import type { AccountCurrentLoaderData } from "./types";

export function BalanceInvoiceForm({
  candidates,
  fieldErrors,
  preview,
  values,
}: {
  candidates: AccountCurrentLoaderData["balanceInvoiceCandidates"];
  fieldErrors: Partial<Record<string, string>>;
  preview?: BalanceInvoicePreviewData;
  values: ReturnType<typeof defaultBalanceInvoiceValues>;
}) {
  const choreographyId = useId();
  const administrativeDiscountAmountId = useId();
  const administrativeDiscountInternalReasonId = useId();
  const administrativeDiscountPublicLabelId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emitir factura de saldo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {candidates.length > 0 ? (
          <>
            <form method="post" className="flex flex-col gap-5" noValidate>
              <input
                type="hidden"
                name="intent"
                value="preview-balance-invoice"
              />
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <Field
                  data-invalid={fieldErrors.choreographyId ? true : undefined}
                  orientation="vertical"
                >
                  <FieldLabel htmlFor={choreographyId}>Coreografía</FieldLabel>
                  <FieldContent>
                    <Select
                      name="choreographyId"
                      defaultValue={values.choreographyId}
                    >
                      <SelectTrigger id={choreographyId}>
                        <SelectValue placeholder="Seleccioná una Coreografía" />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {candidate.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{fieldErrors.choreographyId}</FieldError>
                  </FieldContent>
                </Field>

                <DateOnlyField
                  defaultValue={values.issueDate}
                  error={fieldErrors.issueDate}
                  id="balance-invoice-issue-date"
                  label="Fecha de emisión"
                  name="issueDate"
                />

                <Field
                  data-invalid={
                    fieldErrors.administrativeDiscountAmount ? true : undefined
                  }
                  orientation="vertical"
                >
                  <FieldLabel htmlFor={administrativeDiscountAmountId}>
                    Descuento administrativo
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id={administrativeDiscountAmountId}
                      name="administrativeDiscountAmount"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      defaultValue={values.administrativeDiscountAmount}
                    />
                    <FieldError>
                      {fieldErrors.administrativeDiscountAmount}
                    </FieldError>
                  </FieldContent>
                </Field>

                <Field
                  data-invalid={
                    fieldErrors.administrativeDiscountInternalReason
                      ? true
                      : undefined
                  }
                  orientation="vertical"
                >
                  <FieldLabel htmlFor={administrativeDiscountInternalReasonId}>
                    Motivo interno
                  </FieldLabel>
                  <FieldContent>
                    <Textarea
                      id={administrativeDiscountInternalReasonId}
                      name="administrativeDiscountInternalReason"
                      defaultValue={values.administrativeDiscountInternalReason}
                    />
                    <FieldError>
                      {fieldErrors.administrativeDiscountInternalReason}
                    </FieldError>
                  </FieldContent>
                </Field>

                <Field className="md:col-span-2" orientation="vertical">
                  <FieldLabel htmlFor={administrativeDiscountPublicLabelId}>
                    Etiqueta pública opcional
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id={administrativeDiscountPublicLabelId}
                      name="administrativeDiscountPublicLabel"
                      defaultValue={values.administrativeDiscountPublicLabel}
                    />
                    <FieldError>
                      {fieldErrors.administrativeDiscountPublicLabel}
                    </FieldError>
                  </FieldContent>
                </Field>
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

import { useId } from "react";

import { DateOnlyField } from "@/components/shared/date-only-field";
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

import { formatAmount, formatDate } from "./formatters";
import {
  defaultIssueDepositInvoicesValues,
  defaultBalanceInvoiceValues,
  defaultPaymentImputationValues,
  defaultRegisterPaymentValues,
  paymentMethodOptions,
  type BalanceInvoicePreviewData,
} from "./shared";
import type { AccountCurrentLoaderData } from "./types";

export function PaymentForm({
  fieldErrors,
  values,
}: {
  fieldErrors: Partial<Record<string, string>>;
  values: ReturnType<typeof defaultRegisterPaymentValues>;
}) {
  const amountId = useId();
  const methodId = useId();
  const referenceId = useId();
  const internalNoteId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar pago</CardTitle>
      </CardHeader>
      <CardContent>
        <form method="post" className="flex flex-col gap-5" noValidate>
          <input type="hidden" name="intent" value="register-payment" />
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <DateOnlyField
              defaultValue={values.paymentDate}
              error={fieldErrors.paymentDate}
              id="payment-date"
              label="Fecha de pago"
              name="paymentDate"
            />

            <Field
              data-invalid={fieldErrors.amount ? true : undefined}
              orientation="vertical"
            >
              <FieldLabel htmlFor={amountId}>Monto</FieldLabel>
              <FieldContent>
                <Input
                  id={amountId}
                  name="amount"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  defaultValue={values.amount}
                />
                <FieldError>{fieldErrors.amount}</FieldError>
              </FieldContent>
            </Field>

            <Field
              data-invalid={fieldErrors.paymentMethod ? true : undefined}
              orientation="vertical"
            >
              <FieldLabel htmlFor={methodId}>Medio de pago</FieldLabel>
              <FieldContent>
                <Select
                  name="paymentMethod"
                  defaultValue={values.paymentMethod}
                >
                  <SelectTrigger id={methodId}>
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
                <FieldError>{fieldErrors.paymentMethod}</FieldError>
              </FieldContent>
            </Field>

            <Field orientation="vertical">
              <FieldLabel htmlFor={referenceId}>Referencia</FieldLabel>
              <FieldContent>
                <Input
                  id={referenceId}
                  name="reference"
                  defaultValue={values.reference}
                />
              </FieldContent>
            </Field>

            <Field className="md:col-span-2" orientation="vertical">
              <FieldLabel htmlFor={internalNoteId}>Nota interna</FieldLabel>
              <FieldContent>
                <Textarea
                  id={internalNoteId}
                  name="internalNote"
                  defaultValue={values.internalNote}
                />
              </FieldContent>
            </Field>
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
                <Input
                  id={amountId}
                  name="amount"
                  inputMode="numeric"
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

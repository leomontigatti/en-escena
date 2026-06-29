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
  defaultAccountCurrentCorrectionValues,
  defaultIssueDepositInvoicesValues,
  defaultPaymentImputationValues,
  defaultRegisterPaymentValues,
  paymentMethodOptions,
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
  invoices: Array<AccountCurrentLoaderData["activeDepositInvoices"][number]>;
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
              <FieldLabel htmlFor={invoiceId}>Factura de seña</FieldLabel>
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

  return (
    <form method="post" className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="intent" value={intent} />
      <Field
        data-invalid={fieldErrors[selectName] ? true : undefined}
        orientation="vertical"
      >
        <FieldLabel htmlFor={selectId}>{optionLabel}</FieldLabel>
        <FieldContent>
          <Select name={selectName} defaultValue={selectedValue}>
            <SelectTrigger id={selectId}>
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
          <FieldError>{fieldErrors[selectName]}</FieldError>
        </FieldContent>
      </Field>

      <Field
        data-invalid={fieldErrors.reason ? true : undefined}
        orientation="vertical"
      >
        <FieldLabel htmlFor={reasonId}>Motivo</FieldLabel>
        <FieldContent>
          <Textarea id={reasonId} name="reason" defaultValue={reasonValue} />
          <FieldError>{fieldErrors.reason}</FieldError>
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

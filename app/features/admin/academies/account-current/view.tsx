import { CircleDollarSign, Landmark, Receipt } from "lucide-react";
import { useId } from "react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

import type { loadAdministrativeAcademyAccountCurrent } from "./server";
import {
  defaultAccountCurrentActionValues,
  defaultIssueDepositInvoicesValues,
  defaultRegisterPaymentValues,
  formatPaymentMethodLabel,
  paymentMethodOptions,
  type AdministrativeAcademyAccountCurrentActionData,
} from "./shared";

type LoaderData = Awaited<
  ReturnType<typeof loadAdministrativeAcademyAccountCurrent>
>;

type AdministracionAcademiaCuentaCorrienteRouteViewProps = {
  actionData?: AdministrativeAcademyAccountCurrentActionData;
  loaderData: LoaderData;
};

export function AdministracionAcademiaCuentaCorrienteRouteView({
  actionData,
  loaderData,
}: AdministracionAcademiaCuentaCorrienteRouteViewProps) {
  const values = actionData?.values ?? defaultAccountCurrentActionValues();

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Cuenta corriente"
      description={`Registrá pagos y revisá el saldo operativo de ${loaderData.academy.name} dentro del evento activo.`}
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar pagos",
        description:
          "Activá un evento para registrar pagos y consultar la cuenta corriente de la academia.",
      }}
    >
      <div className="flex flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-2">
          <SummaryCard
            title="Monto total pagado"
            icon={Receipt}
            value={formatAmount(loaderData.summary.totalPaidAmount)}
          />
          <SummaryCard
            title="Saldo disponible"
            icon={CircleDollarSign}
            value={formatAmount(loaderData.summary.availableBalanceAmount)}
          />
        </section>

        {actionData ? (
          <Alert variant="destructive">
            <AlertDescription>{actionData.message}</AlertDescription>
          </Alert>
        ) : null}

        {loaderData.canIssueInvoices ? (
          <DepositInvoiceForm
            candidates={loaderData.depositInvoiceCandidates}
            fieldErrors={actionData?.fieldErrors ?? {}}
            values={values.invoice}
          />
        ) : null}

        {loaderData.activeDepositInvoices.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Facturas de seña activas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factura</TableHead>
                    <TableHead>Coreografía</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loaderData.activeDepositInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {`N° ${invoice.invoiceNumber}`}
                      </TableCell>
                      <TableCell>{invoice.choreographyName}</TableCell>
                      <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                      <TableCell>
                        {invoice.selectedPaymentDeadline
                          ? formatDate(invoice.selectedPaymentDeadline)
                          : "Sin vencimiento"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatAmount(invoice.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        {loaderData.canRegisterPayments ? (
          <PaymentForm
            fieldErrors={actionData?.fieldErrors ?? {}}
            values={values.payment}
          />
        ) : null}

        {loaderData.payments.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Pagos activos</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Medio</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Nota interna</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loaderData.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">
                        {payment.paymentNumber}
                      </TableCell>
                      <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                      <TableCell>
                        {formatPaymentMethodLabel(payment.paymentMethod)}
                      </TableCell>
                      <TableCell>{payment.reference ?? ""}</TableCell>
                      <TableCell>{payment.internalNote ?? ""}</TableCell>
                      <TableCell className="text-right">
                        {formatAmount(payment.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <AdminEmptyState
            icon={Landmark}
            title="Todavía no hay pagos registrados."
            description="Cuando administración registre pagos para esta academia, los vas a poder revisar acá junto con el saldo disponible."
          />
        )}
      </div>
    </AdminResourceLayout>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  value,
}: {
  icon: typeof Receipt;
  title: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function PaymentForm({
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

function DepositInvoiceForm({
  candidates,
  fieldErrors,
  values,
}: {
  candidates: LoaderData["depositInvoiceCandidates"];
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

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const paymentDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatAmount(amount: number) {
  return moneyFormatter.format(amount).replace(/\u00a0/g, " ");
}

function formatDate(value: string) {
  return paymentDateFormatter.format(new Date(`${value}T00:00:00Z`));
}

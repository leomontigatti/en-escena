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
  const values = actionData?.values ?? defaultRegisterPaymentValues();

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

        {loaderData.canRegisterPayments ? (
          <PaymentForm
            fieldErrors={actionData?.fieldErrors ?? {}}
            values={values}
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

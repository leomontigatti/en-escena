import { Lock } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatAmount,
  formatDate,
} from "@/features/admin/academies/account-current/formatters";
import { formatPaymentMethodLabel } from "@/lib/finances/payment-methods";

import type {
  AdminPaymentDetailActionData,
  loadAdminPaymentDetail,
} from "./server";

type LoaderData = Awaited<ReturnType<typeof loadAdminPaymentDetail>>;

type AdministracionPagoDetalleRouteViewProps = {
  actionData?: AdminPaymentDetailActionData;
  loaderData: LoaderData;
};

export function AdministracionPagoDetalleRouteView({
  actionData,
  loaderData,
}: AdministracionPagoDetalleRouteViewProps) {
  const payment = loaderData.payment;
  const [isAnnulDialogOpen, setIsAnnulDialogOpen] = useState(
    actionData?.status === "error",
  );

  useEffect(() => {
    if (actionData?.status === "error") {
      setIsAnnulDialogOpen(true);
    }
  }, [actionData]);

  return (
    <>
      <AdminResourceLayout
        selectedEventId={loaderData.selectedEventId}
        title="Detalle pago"
        description="Consultá los datos registrados del pago. Para corregirlo, anulá el pago incorrecto y registralo nuevamente."
        headerAction={
          payment.annulledAt ? null : (
            <ResourceActionsMenu>
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setIsAnnulDialogOpen(true);
                }}
              >
                Anular
              </DropdownMenuItem>
            </ResourceActionsMenu>
          )
        }
      >
        <AdminResourceFormCard
          contentClassName="gap-5"
          footer={
            <Button asChild variant="outline">
              <Link to={getPaymentsListUrl(loaderData.selectedEventId)}>
                Volver
              </Link>
            </Button>
          }
        >
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <ReadOnlyField
              className="md:col-span-2"
              label="Academia"
              value={payment.academyName}
            />
            <ReadOnlyField
              label="Fecha de pago"
              value={formatDate(payment.paymentDate)}
            />
            <ReadOnlyField label="Referencia" value={payment.reference ?? ""} />
            <ReadOnlyField label="Monto" value={formatAmount(payment.amount)} />
            <ReadOnlyField
              label="Medio de pago"
              value={formatPaymentMethodLabel(payment.paymentMethod)}
            />
            <ReadOnlyTextareaField
              className="md:col-span-2"
              label="Nota interna"
              value={payment.internalNote ?? ""}
            />
            {payment.annulledAt ? (
              <>
                <ReadOnlyField
                  label="Fecha de anulación"
                  value={formatDate(
                    payment.annulledAt.toISOString().slice(0, 10),
                  )}
                />
                <ReadOnlyTextareaField
                  className="md:col-span-2"
                  label="Motivo de anulación"
                  value={payment.annulledReason ?? ""}
                />
              </>
            ) : null}
          </FieldGroup>
        </AdminResourceFormCard>
      </AdminResourceLayout>

      <AnnulPaymentDialog
        actionData={actionData}
        isOpen={isAnnulDialogOpen}
        onOpenChange={setIsAnnulDialogOpen}
      />
    </>
  );
}

export function getAdminPaymentDisplayName(
  payment: LoaderData["payment"] | undefined,
) {
  return payment ? `# ${payment.paymentNumber}` : "Pago";
}

function AnnulPaymentDialog({
  actionData,
  isOpen,
  onOpenChange,
}: {
  actionData?: AdminPaymentDetailActionData;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reasonError = actionData?.fieldErrors.reason;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Anular pago?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta corrección deja el pago fuera del saldo disponible. Si el pago
            tiene imputaciones activas, anulá primero esas imputaciones.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {actionData?.status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>No pudimos anular el pago</AlertTitle>
            <AlertDescription>{actionData.message}</AlertDescription>
          </Alert>
        ) : null}
        <form id="admin-payment-annul-form" method="post" noValidate>
          <input type="hidden" name="intent" value="annul-payment" />
          <Field data-invalid={reasonError ? true : undefined}>
            <FieldLabel htmlFor="annul-payment-reason">Motivo</FieldLabel>
            <FieldContent>
              <Textarea
                id="annul-payment-reason"
                name="reason"
                defaultValue={actionData?.values.reason ?? ""}
                aria-invalid={reasonError ? true : undefined}
              />
              <FieldError>{reasonError}</FieldError>
            </FieldContent>
          </Field>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction asChild variant="destructive">
            <Button type="submit" form="admin-payment-annul-form">
              Anular
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReadOnlyField({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field className={className} data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <div className="relative">
          <Input id={id} value={value} disabled readOnly className="pr-9" />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

function ReadOnlyTextareaField({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field className={className} data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <div className="relative">
          <Textarea
            id={id}
            value={value}
            disabled
            readOnly
            className="min-h-24 resize-none pr-9"
          />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-3 right-3 size-3 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

function getPaymentsListUrl(selectedEventId: string | null) {
  return selectedEventId
    ? `/administracion/pagos?evento=${selectedEventId}`
    : "/administracion/pagos";
}

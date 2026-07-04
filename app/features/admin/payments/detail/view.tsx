import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ReadOnlyField,
  ReadOnlyTextareaField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { TextareaField } from "@/components/shared/textarea-field";
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
import { FieldGroup } from "@/components/ui/field";
import {
  formatAmount,
  formatDate,
} from "@/features/admin/academies/account-current/formatters";
import { annulPaymentSchema } from "@/features/admin/academies/account-current/shared";
import { formatPaymentMethodLabel } from "@/lib/finances/payment-methods";
import { createValidatedNativeSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import type {
  AdminPaymentDetailActionData,
  loadAdminPaymentDetail,
} from "./server";

type LoaderData = Awaited<ReturnType<typeof loadAdminPaymentDetail>>;
type AnnulPaymentFormValues = {
  reason: string;
};
const annulPaymentDialogSchema = annulPaymentSchema.pick({ reason: true });

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

  useServerActionToast(actionData, {
    toastId: "admin-payment-detail:error",
  });

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
  const form = useForm<AnnulPaymentFormValues, unknown, AnnulPaymentFormValues>(
    {
      defaultValues: {
        reason: actionData?.values.reason ?? "",
      },
      mode: "onSubmit",
      resolver: zodResolver(annulPaymentDialogSchema),
    },
  );

  useEffect(() => {
    form.reset({
      reason: actionData?.values.reason ?? "",
    });
  }, [actionData?.values.reason, form]);

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
        <form
          id="admin-payment-annul-form"
          method="post"
          noValidate
          onSubmit={createValidatedNativeSubmitHandler(form)}
        >
          <input type="hidden" name="intent" value="annul-payment" />
          <TextareaField
            control={form.control}
            name="reason"
            id="annul-payment-reason"
            label="Motivo"
          />
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

function getPaymentsListUrl(selectedEventId: string | null) {
  return selectedEventId
    ? `/administracion/pagos?evento=${selectedEventId}`
    : "/administracion/pagos";
}

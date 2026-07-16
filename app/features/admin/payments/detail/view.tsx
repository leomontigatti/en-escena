import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSubmit } from "react-router";
import { Trash2 } from "lucide-react";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
  ReadOnlyTextareaField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { formatAmount } from "@/features/admin/academies/account-current/formatters";
import {
  createPaymentSchema,
  type CreatePaymentFormValues,
  type CreatePaymentSubmissionValues,
} from "@/features/admin/payments/create/shared";
import {
  PaymentAcademyField,
  PaymentFields,
} from "@/features/admin/payments/form-fields";
import { paymentMethodOptions } from "@/lib/finances/payment-methods";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useOptionalNavigation,
  useResetFormValues,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import type {
  AdminPaymentDetailActionData,
  loadAdminPaymentDetail,
} from "./server";
import { deleteAdminPaymentIntent, updateAdminPaymentIntent } from "./shared";

type LoaderData = Awaited<ReturnType<typeof loadAdminPaymentDetail>>;

type AdministracionPagoDetalleRouteViewProps = {
  actionData?: AdminPaymentDetailActionData;
  initialDeleteDialogOpen?: boolean;
  loaderData: LoaderData;
};

export function AdministracionPagoDetalleRouteView({
  actionData,
  initialDeleteDialogOpen = false,
  loaderData,
}: AdministracionPagoDetalleRouteViewProps) {
  const payment = loaderData.payment;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(
    initialDeleteDialogOpen || actionData?.intent === deleteAdminPaymentIntent,
  );

  useServerActionToast(actionData, {
    toastId: "admin-payment-detail:error",
  });

  useEffect(() => {
    if (actionData?.intent === deleteAdminPaymentIntent) {
      setIsDeleteDialogOpen(true);
    }
  }, [actionData]);

  return (
    <>
      <AdminResourceLayout
        selectedEventId={loaderData.selectedEventId}
        title="Detalle pago"
        description="Consultá y editá los datos registrados del pago."
        headerAction={
          loaderData.canDelete ? (
            <ResourceActionsMenu>
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setIsDeleteDialogOpen(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                Eliminar pago
              </DropdownMenuItem>
            </ResourceActionsMenu>
          ) : null
        }
      >
        <PaymentDetailForm actionData={actionData} loaderData={loaderData} />
      </AdminResourceLayout>

      {loaderData.canDelete ? (
        <DeleteDialog
          description="El pago va a quedar fuera del saldo disponible. Si tiene asignaciones activas, eliminá primero esas asignaciones."
          intentValue={deleteAdminPaymentIntent}
          onOpenChange={setIsDeleteDialogOpen}
          open={isDeleteDialogOpen}
          recordId={payment.id}
          title="Eliminar pago"
        />
      ) : null}
    </>
  );
}

export function getAdminPaymentDisplayName(
  payment: LoaderData["payment"] | undefined,
) {
  return payment ? `# ${payment.paymentNumber}` : "Pago";
}

function PaymentDetailForm({
  actionData,
  loaderData,
}: {
  actionData?: AdminPaymentDetailActionData;
  loaderData: LoaderData;
}) {
  if (loaderData.canEdit) {
    return (
      <EditablePaymentDetailForm
        actionData={actionData}
        loaderData={loaderData}
      />
    );
  }

  return <ReadOnlyPaymentDetail loaderData={loaderData} />;
}

function EditablePaymentDetailForm({
  actionData,
  loaderData,
}: {
  actionData?: AdminPaymentDetailActionData;
  loaderData: LoaderData;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: updateAdminPaymentIntent,
  });
  const values =
    actionData?.intent === updateAdminPaymentIntent
      ? actionData.values
      : loaderData.values;
  const form = useForm<
    CreatePaymentFormValues,
    unknown,
    CreatePaymentSubmissionValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(createPaymentSchema),
  });
  const submit = useSubmit();
  useResetFormValues(form.reset, values);

  return (
    <form
      method="post"
      noValidate
      onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
    >
      <input type="hidden" name="intent" value={updateAdminPaymentIntent} />
      <AdminResourceFormCard
        contentClassName="gap-5"
        footer={
          <>
            <Button asChild variant="outline">
              <Link to={getPaymentsListUrl(loaderData.selectedEventId)}>
                Volver
              </Link>
            </Button>
            <SubmitButton isPending={isPending} />
          </>
        }
      >
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <PaymentAcademyField
            academies={loaderData.academies}
            control={form.control}
            disabled={loaderData.allocatedAmount > 0}
            value={values.academyId}
          />
          <PaymentFields control={form.control} />
        </FieldGroup>
      </AdminResourceFormCard>
    </form>
  );
}

function ReadOnlyPaymentDetail({ loaderData }: { loaderData: LoaderData }) {
  const payment = loaderData.payment;

  return (
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
        <ReadOnlyDateField label="Fecha de pago" value={payment.paymentDate} />
        <ReadOnlyField label="Referencia" value={payment.reference ?? ""} />
        <ReadOnlyField label="Monto" value={formatAmount(payment.amount)} />
        <ReadOnlySelectField
          label="Medio de pago"
          options={paymentMethodOptions}
          value={payment.paymentMethod}
        />
        <ReadOnlyTextareaField
          className="md:col-span-2"
          label="Nota interna"
          value={payment.internalNote ?? ""}
        />
      </FieldGroup>
    </AdminResourceFormCard>
  );
}

function getPaymentsListUrl(selectedEventId: string | null) {
  return selectedEventId
    ? `/administracion/pagos?evento=${selectedEventId}`
    : "/administracion/pagos";
}

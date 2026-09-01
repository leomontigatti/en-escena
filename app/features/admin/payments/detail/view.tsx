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
import { formatAmount } from "@/features/admin/finances/formatters";
import {
  createPaymentSchema,
  type CreatePaymentFormValues,
  type CreatePaymentSubmissionValues,
} from "@/features/admin/payments/create/shared";
import {
  PaymentAcademyField,
  PaymentFields,
} from "@/features/admin/payments/form-fields";
import { formatInscriptionFinancialStatus } from "@/lib/finances/choreography-financial-status";
import { paymentMethodOptions } from "@/lib/finances/payment-methods";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useOptionalNavigation,
  useResetFormValues,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { PaymentDetailActionData, loadPaymentDetail } from "./server";
import { deletePaymentIntent, updatePaymentIntent } from "./shared";

type LoaderData = Awaited<ReturnType<typeof loadPaymentDetail>>;

type PaymentDetailRouteViewProps = {
  actionData?: PaymentDetailActionData;
  initialDeleteDialogOpen?: boolean;
  loaderData: LoaderData;
};

export function PaymentDetailRouteView({
  actionData,
  initialDeleteDialogOpen = false,
  loaderData,
}: PaymentDetailRouteViewProps) {
  const payment = loaderData.payment;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(
    initialDeleteDialogOpen || actionData?.intent === deletePaymentIntent,
  );

  const errorData = actionData?.status === "error" ? actionData : undefined;
  const successData = actionData?.status === "success" ? actionData : undefined;

  useServerActionToast(errorData, {
    toastId: "admin-payment-detail:error",
  });
  useServerActionToast(successData, {
    toastId: "admin-payment-detail:success",
  });

  useEffect(() => {
    if (actionData?.intent === deletePaymentIntent) {
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
          description={
            loaderData.affectedChoreographies.length > 0
              ? "El pago y sus asignaciones se eliminan juntos. Ese dinero sale del pool: no vuelve al saldo disponible de la academia."
              : "El pago sale del pool: el saldo disponible de la academia baja por su monto."
          }
          details={
            loaderData.affectedChoreographies.length > 0 ? (
              <AffectedChoreographiesList
                choreographies={loaderData.affectedChoreographies}
              />
            ) : undefined
          }
          intentValue={deletePaymentIntent}
          onOpenChange={setIsDeleteDialogOpen}
          open={isDeleteDialogOpen}
          recordId={payment.id}
          title="Eliminar pago"
        />
      ) : null}
    </>
  );
}

/**
 * Every choreography the payment reaches, with what it takes out of it and how
 * many inscriptions stop meeting a threshold they had crossed. None of it
 * blocks: the deletion always proceeds, so the list informs rather than warns.
 *
 * The resulting status is named only when something actually un-crosses. With
 * nothing un-crossing there is no new state to announce, and naming the one it
 * already had would read as a consequence of deleting the payment.
 */
function AffectedChoreographiesList({
  choreographies,
}: {
  choreographies: LoaderData["affectedChoreographies"];
}) {
  return (
    <ul className="divide-y divide-border rounded-md border text-sm">
      {choreographies.map((choreography) => (
        <li key={choreography.id} className="flex flex-col gap-0.5 px-3 py-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{choreography.name}</span>
            <span className="tabular-nums">
              {formatAmount(choreography.allocatedAmount)}
            </span>
          </div>
          {choreography.uncrossingInscriptionCount > 0 &&
          choreography.resultingStatus !== null ? (
            <span className="text-xs text-muted-foreground">
              {choreography.uncrossingInscriptionCount === 1
                ? "1 inscripción deja de cumplir un umbral"
                : `${choreography.uncrossingInscriptionCount} inscripciones dejan de cumplir un umbral`}
              {" · queda "}
              {formatInscriptionFinancialStatus(choreography.resultingStatus)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function getPaymentDisplayName(
  payment: LoaderData["payment"] | undefined,
) {
  return payment
    ? `# ${formatEventSequenceNumber(payment.paymentNumber)}`
    : "Pago";
}

function PaymentDetailForm({
  actionData,
  loaderData,
}: {
  actionData?: PaymentDetailActionData;
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
  actionData?: PaymentDetailActionData;
  loaderData: LoaderData;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: updatePaymentIntent,
  });
  const values =
    actionData?.status === "error" && actionData.intent === updatePaymentIntent
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
      <input type="hidden" name="intent" value={updatePaymentIntent} />
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

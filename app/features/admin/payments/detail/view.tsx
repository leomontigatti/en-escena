import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useSubmit } from "react-router";
import { Trash2 } from "lucide-react";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
  ReadOnlyTextareaField,
} from "@/components/shared/read-only-field";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { formatAmount } from "@/lib/finances/formatters";
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
        <div className="flex flex-col gap-6">
          {/* Above the form and alone: `Monto` is already a field a few
              centimetres below, and repeating it here would say the same number
              twice. This one is derived and cannot be edited, which is why it
              does not belong among the fields.

              It breaks at `md` and not at `sm` so that the one card tracks the
              form under it, which is a single column until `md` too. Breaking
              earlier left the card at half width with an empty cell beside it,
              over a form that was still full width. */}
          <section className="grid gap-4 md:grid-cols-2">
            <MetricCard
              title="Disponible"
              value={formatAmount(loaderData.availableAmount)}
            />
          </section>

          <PaymentDetailForm actionData={actionData} loaderData={loaderData} />
        </div>
      </AdminResourceLayout>

      {loaderData.canDelete ? (
        <DeleteDialog
          description={
            loaderData.affectedUnits.length > 0
              ? "El pago y sus asignaciones se eliminan juntos. Ese dinero sale del pool: no vuelve al saldo disponible de la academia."
              : "El pago sale del pool: el saldo disponible de la academia baja por su monto."
          }
          details={
            loaderData.affectedUnits.length > 0 ? (
              <AffectedUnitsList units={loaderData.affectedUnits} />
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
 * Every unit the payment reaches — choreographies and seminars in one list,
 * named by the choreography's name and by the seminar's instructor — with what
 * the deletion takes out of it and what its inscriptions lose. None of it
 * blocks: the deletion always proceeds, so the list informs rather than warns.
 *
 * The two kinds lose different things. A choreography names the threshold its
 * inscriptions stop meeting, and only when something actually un-crosses: with
 * nothing un-crossing there is no new state to announce, and naming the one it
 * already had would read as a consequence of deleting the payment. A seminar
 * names the **places** it gives back, because there covering the deposit is what
 * took the place.
 */
function AffectedUnitsList({ units }: { units: LoaderData["affectedUnits"] }) {
  return (
    <ul className="divide-y divide-border rounded-md border text-sm">
      {units.map((unit) => (
        <li
          key={`${unit.kind}:${unit.id}`}
          className="flex flex-col gap-0.5 px-3 py-2"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{unit.name}</span>
            <span className="tabular-nums">
              {formatAmount(unit.allocatedAmount)}
            </span>
          </div>
          <AffectedUnitConsequence unit={unit} />
        </li>
      ))}
    </ul>
  );
}

function AffectedUnitConsequence({
  unit,
}: {
  unit: LoaderData["affectedUnits"][number];
}) {
  if (unit.kind === "seminar") {
    return unit.losingPlaceCount > 0 ? (
      <span className="text-xs text-muted-foreground">
        {unit.losingPlaceCount === 1
          ? "1 inscripción pierde su lugar"
          : `${unit.losingPlaceCount} inscripciones pierden su lugar`}
      </span>
    ) : null;
  }

  return unit.uncrossingInscriptionCount > 0 &&
    unit.resultingStatus !== null ? (
    <span className="text-xs text-muted-foreground">
      {unit.uncrossingInscriptionCount === 1
        ? "1 inscripción deja de cumplir un umbral"
        : `${unit.uncrossingInscriptionCount} inscripciones dejan de cumplir un umbral`}
      {" · queda "}
      {formatInscriptionFinancialStatus(unit.resultingStatus)}
    </span>
  ) : null;
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
            <BackButton to={getPaymentsListUrl(loaderData.selectedEventId)} />
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
        <BackButton to={getPaymentsListUrl(loaderData.selectedEventId)} />
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

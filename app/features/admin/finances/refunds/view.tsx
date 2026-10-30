import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useFormState } from "react-hook-form";
import { useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { FormActions } from "@/components/shared/form-actions";
import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
  ReadOnlyTextareaField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import {
  createPaymentSchema,
  type CreatePaymentFormValues,
  type CreatePaymentSubmissionValues,
} from "@/features/admin/payments/create/shared";
import { PaymentFields } from "@/features/admin/payments/form-fields";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatAmount } from "@/lib/finances/formatters";
import { movementKindLabels } from "@/lib/finances/movement-kinds";
import { paymentMethodOptions } from "@/lib/finances/payment-methods";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useLastRefusedValues,
  useOptionalNavigation,
  useSavedFormValues,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { loadRefundDetail } from "./server";
import {
  deleteRefundIntent,
  updateRefundIntent,
  type RefundDetailActionData,
} from "./shared";

type LoaderData = Awaited<ReturnType<typeof loadRefundDetail>>;

export function getRefundDisplayName(refund: LoaderData["refund"] | undefined) {
  return refund
    ? `Reembolso # ${formatEventSequenceNumber(refund.refundNumber)}`
    : "Reembolso";
}

export function RefundDetailRouteView({
  actionData,
  loaderData,
}: {
  actionData?: RefundDetailActionData;
  loaderData: LoaderData;
}) {
  const { canWrite, refund, selectedEventId, version } = loaderData;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useServerActionToast(actionData);

  return (
    <>
      <AdminResourceLayout
        selectedEventId={selectedEventId}
        title={getRefundDisplayName(refund)}
        description="Consultá y editá los datos registrados del reembolso."
        headerAction={
          canWrite ? (
            <ResourceActionsMenu>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setIsDeleteDialogOpen(true)}
              >
                Eliminar
              </DropdownMenuItem>
            </ResourceActionsMenu>
          ) : null
        }
      >
        {canWrite ? (
          // A new version starts a new form: a retry must not save what was
          // typed against a refund that has since changed, even when what the
          // form shows of it reads the same.
          <EditableRefundForm
            key={version}
            actionData={actionData}
            loaderData={loaderData}
          />
        ) : (
          <ReadOnlyRefund refund={refund} />
        )}
      </AdminResourceLayout>

      {canWrite ? (
        <DeleteDialog
          confirmFieldName="version"
          confirmFieldValue={version}
          description="El saldo disponible de la academia sube por el monto del reembolso."
          intentValue={deleteRefundIntent}
          onOpenChange={setIsDeleteDialogOpen}
          open={isDeleteDialogOpen}
          recordId={refund.id}
          title="¿Eliminar el reembolso?"
        />
      ) : null}
    </>
  );
}

function EditableRefundForm({
  actionData,
  loaderData,
}: {
  actionData?: RefundDetailActionData;
  loaderData: LoaderData;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: updateRefundIntent,
  });
  const form = useForm<
    CreatePaymentFormValues,
    unknown,
    CreatePaymentSubmissionValues
  >({
    defaultValues: loaderData.values,
    mode: "onSubmit",
    resolver: zodResolver(createPaymentSchema),
  });
  const submit = useSubmit();
  const { isDirty } = useFormState({ control: form.control });
  const refused =
    actionData?.status === "error" && actionData.intent === updateRefundIntent
      ? actionData.values
      : undefined;

  useSavedFormValues(form, loaderData.values, useLastRefusedValues(refused));

  return (
    <form
      method="post"
      noValidate
      className="flex flex-1 flex-col gap-6"
      onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
    >
      <input type="hidden" name="intent" value={updateRefundIntent} />
      <input type="hidden" name="version" value={loaderData.version} />
      <AdminResourceFormCard
        contentClassName="gap-5"
        footer={
          <FormActions
            backTo="/administracion/movimientos"
            hasChanges={isDirty}
            isPending={isPending}
            onDiscard={() => form.reset()}
          />
        }
      >
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <ReadOnlyField label="Tipo" value={movementKindLabels.refund} />
          <ReadOnlyField
            hiddenValue={loaderData.refund.academyId}
            label="Academia"
            name="academyId"
            value={loaderData.refund.academyName}
          />
          <PaymentFields control={form.control} />
        </FieldGroup>
      </AdminResourceFormCard>
    </form>
  );
}

function ReadOnlyRefund({ refund }: { refund: LoaderData["refund"] }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <AdminResourceFormCard
        contentClassName="gap-5"
        footer={
          <FormActions
            backTo="/administracion/movimientos"
            canEdit={false}
            hasChanges={false}
            isPending={false}
            onDiscard={() => undefined}
          />
        }
      >
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <ReadOnlyField label="Tipo" value={movementKindLabels.refund} />
          <ReadOnlyField label="Academia" value={refund.academyName} />
          <ReadOnlyDateField label="Fecha" value={refund.refundDate} />
          <ReadOnlyField label="Referencia" value={refund.reference ?? ""} />
          <ReadOnlyField label="Monto" value={formatAmount(refund.amount)} />
          <ReadOnlySelectField
            label="Medio"
            options={paymentMethodOptions}
            value={refund.refundMethod}
          />
          <ReadOnlyTextareaField
            className="md:col-span-2"
            label="Nota interna"
            value={refund.internalNote ?? ""}
          />
        </FieldGroup>
      </AdminResourceFormCard>
    </div>
  );
}

import { useEffect, useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import { ProfessorConfirmationDialog } from "./confirmation-dialog";
import { useProfessorEditForm, useProfessorReasonForm } from "./form";
import {
  ProfessorDetailAlerts,
  ProfessorDetailCard,
  ProfessorDetailHeaderActions,
} from "./sections";
import {
  getInitialDialogIntent,
  getProfessorConfirmationAction,
  getProfessorEditValues,
  getProfessorReasonValues,
  getSubmittedProfessorUpdateValues,
  type ProfessorActionError,
  type ProfessorDetailLoaderData,
  type ProfessorDialogIntent,
  type ProfessorEditFormValues,
  toProfessorEditValues,
} from "./shared";

export type AdministracionProfesorDetalleRouteViewProps = {
  actionData?: ProfessorActionError;
  loaderData: ProfessorDetailLoaderData;
};

export function AdministracionProfesorDetalleRouteView({
  actionData,
  loaderData,
}: AdministracionProfesorDetalleRouteViewProps) {
  useServerActionToast(actionData, {
    toastId: "admin-professor-detail:error",
  });

  const professor = loaderData.professor;
  const isEditing =
    loaderData.canEdit && (loaderData.isEditing || Boolean(actionData));
  const submittedUpdateValues = getSubmittedProfessorUpdateValues(actionData);
  const editValues = getProfessorEditValues({ actionData, professor });
  const reasonValues = getProfessorReasonValues(actionData);
  const editForm = useProfessorEditForm({ values: editValues });
  const reasonForm = useProfessorReasonForm({
    correctionReasonRequired: professor.correctionReasonRequired,
    values: reasonValues,
  });
  const [dialogIntent, setDialogIntent] =
    useState<ProfessorDialogIntent | null>(
      getInitialDialogIntent(actionData, professor.correctionReasonRequired),
    );
  const [pendingUpdateValues, setPendingUpdateValues] =
    useState<ProfessorEditFormValues | null>(
      submittedUpdateValues
        ? toProfessorEditValues(submittedUpdateValues)
        : null,
    );

  useEffect(() => {
    const nextIntent = getInitialDialogIntent(
      actionData,
      professor.correctionReasonRequired,
    );
    if (!nextIntent) {
      return;
    }

    setDialogIntent(nextIntent);

    if (submittedUpdateValues) {
      setPendingUpdateValues(toProfessorEditValues(submittedUpdateValues));
    }
  }, [actionData, professor.correctionReasonRequired, submittedUpdateValues]);

  const confirmationAction = getProfessorConfirmationAction({
    active: professor.active,
    intent: dialogIntent,
  });

  function handleEditSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const submitNative = () => {
      event.currentTarget.submit();
    };
    const openDialog = (values: ProfessorEditFormValues) => {
      setPendingUpdateValues(values);
      setDialogIntent("update-professor");
    };

    if (!professor.correctionReasonRequired) {
      void editForm.form.handleSubmit(submitNative)(event);
      return;
    }

    void editForm.form.handleSubmit(openDialog)(event);
  }

  function openStatusDialog(
    intent: "archive-professor" | "reactivate-professor",
  ) {
    reasonForm.form.reset({
      correctionReason: actionData?.values.correctionReason ?? "",
      statusIntent: intent,
    });
    setDialogIntent(intent);
  }

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      requireSelectedEvent={false}
      title="Detalle profesor"
      description="Revisá la información administrativa de este profesor."
      headerAction={
        <ProfessorDetailHeaderActions
          active={professor.active}
          canEdit={loaderData.canEdit}
          onSelectIntent={openStatusDialog}
        />
      }
    >
      <section className="flex flex-col gap-6">
        <ProfessorDetailAlerts
          active={professor.active}
          canEdit={loaderData.canEdit}
          isIncomplete={professor.isIncomplete}
          onSelectIntent={openStatusDialog}
        />

        <ProfessorDetailCard
          backToList={loaderData.backToList}
          cancelHref={loaderData.cancelHref}
          canEdit={loaderData.canEdit}
          editForm={editForm}
          editFormId="administracion-profesor-form"
          editHref={loaderData.editHref}
          isEditing={isEditing}
          onSubmit={handleEditSubmit}
          professor={professor}
        />
      </section>

      <ProfessorConfirmationDialog
        action={confirmationAction}
        correctionReasonRequired={
          dialogIntent === "update-professor" ||
          professor.correctionReasonRequired
        }
        intent={dialogIntent}
        onOpenChange={(open) => {
          if (!open) {
            setDialogIntent(null);
          }
        }}
        pendingUpdateValues={pendingUpdateValues}
        reasonForm={reasonForm}
      />
    </AdminResourceLayout>
  );
}

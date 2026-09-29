import { useEffect, useState } from "react";
import { useNavigation, useSubmit } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useMergeDialogState } from "@/features/admin/merge/dialog";
import { RosterMergeDialog } from "@/features/admin/merge/roster-dialog";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import { ProfessorConfirmationDialog } from "./confirmation-dialog";
import { useProfessorEditForm } from "./form";
import {
  ProfessorDetailAlerts,
  ProfessorDetailForm,
  ProfessorDetailHeaderActions,
} from "./sections";
import {
  buildProfessorDetailViewState,
  getInitialDialogIntent,
  getProfessorConfirmationAction,
  getProfessorEditValues,
  getSubmittedProfessorUpdateValues,
  type ProfessorDetailActionData,
  type ProfessorDetailLoaderData,
  type ProfessorDialogIntent,
  type ProfessorEditFormValues,
  toProfessorEditValues,
} from "./shared";

const editFormId = "administracion-profesor-form";

export type ProfessorDetailRouteViewProps = {
  actionData?: ProfessorDetailActionData;
  loaderData: ProfessorDetailLoaderData;
};

export function ProfessorDetailRouteView({
  actionData,
  loaderData,
}: ProfessorDetailRouteViewProps) {
  const errorData = actionData?.status === "error" ? actionData : undefined;
  // A warning keeps the submitted values in the form and asks the
  // administrator to confirm.
  const nameWarning = actionData?.status === "warning" ? actionData : undefined;
  const successData = actionData?.status === "success" ? actionData : undefined;
  const mergeDialog = useMergeDialogState(loaderData.professor.id, actionData);

  useServerActionToast(errorData, {
    toastId: "admin-professor-detail:error",
  });
  useServerActionToast(successData, {
    toastId: "admin-professor-detail:success",
  });

  const professor = loaderData.professor;
  const {
    dialogIntent,
    editForm,
    handleEditSubmit,
    isSaving,
    pendingUpdateValues,
    setDialogIntent,
  } = useProfessorSave({ errorData, nameWarning, professor });

  const viewState = buildProfessorDetailViewState({
    active: professor.active,
    isParticipatingInActiveEvent: loaderData.isParticipatingInActiveEvent,
  });
  const confirmationAction = getProfessorConfirmationAction({
    active: professor.active,
    intent: dialogIntent,
  });
  function openStatusDialog(
    intent: "archive-professor" | "reactivate-professor",
  ) {
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
          canEdit={loaderData.canEdit}
          onSelectIntent={openStatusDialog}
          onSelectMerge={() => mergeDialog.onOpenChange(true)}
          statusAction={viewState.statusAction}
        />
      }
    >
      <ProfessorDetailAlerts
        active={professor.active}
        canEdit={loaderData.canEdit}
        isIncomplete={professor.isIncomplete}
        onSelectIntent={openStatusDialog}
        participatingAlert={viewState.participatingAlert}
      />

      <ProfessorDetailForm
        backToList={loaderData.backToList}
        canEdit={loaderData.canEdit}
        editForm={editForm}
        editFormId={editFormId}
        isSaving={isSaving}
        nameWarning={nameWarning?.warning}
        onSubmit={handleEditSubmit}
        professor={professor}
      />

      <ProfessorConfirmationDialog
        action={confirmationAction}
        intent={dialogIntent}
        onOpenChange={(open) => {
          if (!open) {
            setDialogIntent(null);
          }
        }}
        pendingUpdateValues={pendingUpdateValues}
      />

      <RosterMergeDialog
        kind="professor"
        merge={loaderData.merge}
        person={professor}
        {...mergeDialog}
      />
    </AdminResourceLayout>
  );
}

/**
 * The edit form and its save: straight through, or through the confirmation
 * dialog, holding the values it will post, when the save has consequences.
 */
function useProfessorSave({
  errorData,
  nameWarning,
  professor,
}: {
  errorData?: Extract<ProfessorDetailActionData, { status: "error" }>;
  nameWarning?: Extract<ProfessorDetailActionData, { status: "warning" }>;
  professor: ProfessorDetailLoaderData["professor"];
}) {
  const isConsequential = professor.editConsequence !== null;
  const submittedUpdateValues = getSubmittedProfessorUpdateValues(errorData);
  const savedValues = getProfessorEditValues({
    actionData: undefined,
    professor,
  });
  const editForm = useProfessorEditForm({
    actionData: errorData,
    savedValues,
    submittedValues: nameWarning
      ? nameWarning.values
      : submittedUpdateValues
        ? getProfessorEditValues({ actionData: errorData, professor })
        : null,
  });
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = isRouteFormPending(navigation, {
    intent: "update-professor",
  });
  const [dialogIntent, setDialogIntent] =
    useState<ProfessorDialogIntent | null>(
      getInitialDialogIntent(errorData, isConsequential),
    );
  const [pendingUpdateValues, setPendingUpdateValues] =
    useState<ProfessorEditFormValues | null>(
      submittedUpdateValues
        ? toProfessorEditValues(submittedUpdateValues)
        : null,
    );

  useEffect(() => {
    const nextIntent = getInitialDialogIntent(errorData, isConsequential);
    if (!nextIntent) {
      return;
    }

    setDialogIntent(nextIntent);

    if (submittedUpdateValues) {
      setPendingUpdateValues(toProfessorEditValues(submittedUpdateValues));
    }
  }, [errorData, isConsequential, submittedUpdateValues]);

  const submitEdit = createValidatedRouteSubmitHandler(editForm.form, submit);

  function handleEditSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const openDialog = (values: ProfessorEditFormValues) => {
      setPendingUpdateValues(values);
      setDialogIntent("update-professor");
    };

    if (!isConsequential) {
      submitEdit(event);
      return;
    }

    void editForm.form.handleSubmit(openDialog)(event);
  }

  return {
    dialogIntent,
    editForm,
    handleEditSubmit,
    isSaving,
    pendingUpdateValues,
    setDialogIntent,
  };
}

import { useEffect, useState } from "react";
import { Form, useNavigation, useSubmit } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { useRosterRefusalToast } from "@/components/shared/roster-document-conflict";
import { RosterPersonArchiveBlockedDialog } from "@/components/shared/roster-person-archive-blocked-dialog";
import { useMergeDialogState } from "@/features/admin/merge/dialog";
import { RosterMergeDialog } from "@/features/admin/merge/roster-dialog";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  useLatestActionData,
} from "@/lib/shared/forms";
import { rosterMergeIntents } from "@/lib/roster/roster-merge.shared";
import { isMergeRefusal } from "@/lib/shared/merge";
import { useServerActionToast } from "@/lib/shared/toasts";

import { useProfessorEditForm } from "./form";
import {
  ProfessorDetailAlerts,
  ProfessorDetailForm,
  ProfessorDetailHeaderActions,
} from "./sections";
import {
  getProfessorDocumentConflict,
  buildProfessorDetailViewState,
  getInitialDialogIntent,
  getProfessorConfirmationAction,
  getProfessorDialogFormId,
  getProfessorEditValues,
  getSubmittedProfessorUpdateValues,
  type ProfessorActionError,
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
  // A refused merge is an `"error"` too; its intent hands it to the merge
  // dialog, and the edit form never sees it.
  const errorData =
    actionData?.status === "error" &&
    !isMergeRefusal(actionData, rosterMergeIntents.professor)
      ? actionData
      : undefined;
  // A warning keeps the submitted values in the form and asks the
  // administrator to confirm.
  const nameWarning = actionData?.status === "warning" ? actionData : undefined;
  const successData = actionData?.status === "success" ? actionData : undefined;
  const mergeDialog = useMergeDialogState(
    loaderData.professor.id,
    actionData,
    rosterMergeIntents.professor,
  );

  useRosterRefusalToast({
    conflict: getProfessorDocumentConflict(errorData),
    refusal: errorData,
    toastId: "admin-professor-detail:error",
  });
  useServerActionToast(successData, {
    toastId: "admin-professor-detail:success",
  });

  const professor = loaderData.professor;
  const latestActionData = useLatestActionData(actionData, professor.id);
  const {
    dialogIntent,
    editForm,
    handleEditSubmit,
    isSaving,
    pendingUpdateValues,
    setDialogIntent,
  } = useProfessorSave({
    errorData,
    professor,
    refused: latestActionData,
  });

  const viewState = buildProfessorDetailViewState({
    active: professor.active,
    isParticipatingInActiveEvent: loaderData.isParticipatingInActiveEvent,
  });
  const confirmationAction = getProfessorConfirmationAction({
    active: professor.active,
    intent: dialogIntent,
  });
  const isArchiveBlockedOpen =
    dialogIntent === "archive-professor" && viewState.statusAction.isBlocked;
  function openStatusDialog(
    intent: "archive-professor" | "reactivate-professor",
  ) {
    setDialogIntent(intent);
  }

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      requireSelectedEvent={false}
      title={`${professor.firstName} ${professor.lastName}`}
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
      />

      <ProfessorDetailForm
        backToList={loaderData.backToList}
        canEdit={loaderData.canEdit}
        choreographies={loaderData.choreographies}
        selectedEventId={loaderData.selectedEventId}
        seminarInscriptions={loaderData.seminarInscriptions}
        editForm={editForm}
        editFormId={editFormId}
        isSaving={isSaving}
        nameWarning={nameWarning?.warning}
        onSubmit={handleEditSubmit}
        professor={professor}
      />

      <RosterPersonArchiveBlockedDialog
        kind="professor"
        onOpenChange={(open) => {
          if (!open) {
            setDialogIntent(null);
          }
        }}
        open={isArchiveBlockedOpen}
      />

      {/* Unmounted while closed, so the copy never falls back to the status
          action's while the dialog animates out of a save. */}
      {dialogIntent && !isArchiveBlockedOpen ? (
        <ConfirmationDialog
          confirmIcon={confirmationAction.confirmIcon}
          confirmLabel={confirmationAction.confirmLabel}
          description={confirmationAction.description}
          destructive={confirmationAction.destructive}
          title={confirmationAction.title}
          confirmDisabled={
            dialogIntent === "update-professor" && pendingUpdateValues === null
          }
          form={getProfessorDialogFormId(confirmationAction.intent)}
          onOpenChange={(open) => {
            if (!open) {
              setDialogIntent(null);
            }
          }}
          open
        >
          <ProfessorConfirmationForm
            intent={confirmationAction.intent}
            pendingUpdateValues={pendingUpdateValues}
          />
        </ConfirmationDialog>
      ) : null}

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
 * The hidden form the confirmation submits: the intent, and for a save the
 * values the administrator confirmed.
 */
function ProfessorConfirmationForm({
  intent,
  pendingUpdateValues,
}: {
  intent: ProfessorDialogIntent;
  pendingUpdateValues: ProfessorEditFormValues | null;
}) {
  const pendingUpdateFields =
    intent === "update-professor" ? pendingUpdateValues : null;

  return (
    <Form id={getProfessorDialogFormId(intent)} method="post" noValidate>
      <input type="hidden" name="intent" value={intent} />
      {pendingUpdateFields ? (
        <>
          <input
            type="hidden"
            name="firstName"
            value={pendingUpdateFields.firstName}
          />
          <input
            type="hidden"
            name="lastName"
            value={pendingUpdateFields.lastName}
          />
          <input
            type="hidden"
            name="documentType"
            value={pendingUpdateFields.documentType}
          />
          <input
            type="hidden"
            name="documentNumber"
            value={pendingUpdateFields.documentNumber}
          />
        </>
      ) : null}
    </Form>
  );
}

/**
 * The edit form and its save: straight through, or through the confirmation
 * dialog, holding the values it will post, when the save has consequences.
 */
function useProfessorSave({
  errorData,
  professor,
  refused,
}: {
  errorData?: ProfessorActionError;
  professor: ProfessorDetailLoaderData["professor"];
  /** The latest answer, kept so the refused values outlive a search in the
   * other tabs' lists. */
  refused?: ProfessorDetailActionData;
}) {
  const isConsequential = professor.editConsequence !== null;
  const submittedUpdateValues = getSubmittedProfessorUpdateValues(errorData);
  const refusedError =
    refused?.status === "error" &&
    !isMergeRefusal(refused, rosterMergeIntents.professor)
      ? refused
      : undefined;
  const savedValues = getProfessorEditValues({
    actionData: undefined,
    professor,
  });
  const editForm = useProfessorEditForm({
    savedValues,
    submittedValues:
      refused?.status === "warning"
        ? refused.values
        : getSubmittedProfessorUpdateValues(refusedError)
          ? getProfessorEditValues({ actionData: refusedError, professor })
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

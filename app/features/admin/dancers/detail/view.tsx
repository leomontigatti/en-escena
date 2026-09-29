import { useEffect, useRef, useState, type SubmitEventHandler } from "react";
import { useNavigation, useSubmit } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useMergeDialogState } from "@/features/admin/merge/dialog";
import { RosterMergeDialog } from "@/features/admin/merge/roster-dialog";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import { useRecordTitleDetailTransitionStyle } from "@/lib/shared/view-transitions";

import { DancerConfirmationDialog } from "./confirmation-dialog";
import { useDancerEditForm } from "./form";
import {
  buildDancerDetailViewState,
  getDancerEditValues,
  getInitialDialogIntent,
  getSubmittedDancerUpdateValues,
  type DancerDetailActionData,
  type DancerDetailLoaderData,
  type DancerDialogIntent,
} from "./shared";
import {
  DancerDetailAlerts,
  DancerDetailForm,
  DancerDetailHeaderActions,
  InscriptionsSection,
  type InscriptionsSectionProps,
} from "./sections";

type DancerDetailRouteViewProps = {
  actionData?: DancerDetailActionData;
  loaderData: DancerDetailLoaderData;
};

const editFormId = "admin-dancer-edit-form";
const statusFormId = "admin-dancer-status-form";
const verifyFormId = "admin-dancer-verify-form";

export type { InscriptionsSectionProps };
export { InscriptionsSection };

export function DancerDetailRouteView({
  actionData,
  loaderData,
}: DancerDetailRouteViewProps) {
  const errorData = actionData?.status === "error" ? actionData : undefined;
  // A warning keeps the submitted values in the form and asks the
  // administrator to confirm.
  const nameWarning = actionData?.status === "warning" ? actionData : undefined;
  const successData = actionData?.status === "success" ? actionData : undefined;
  const mergeDialog = useMergeDialogState(loaderData.dancer.id, actionData);

  useServerActionToast(errorData, {
    toastId: "admin-dancer-detail:error",
  });
  useServerActionToast(successData, {
    toastId: "admin-dancer-detail:success",
  });

  const dancer = loaderData.dancer;
  const {
    confirmSave,
    dialogIntent,
    editForm,
    handleEditSubmit,
    isSaving,
    setDialogIntent,
    viewState,
  } = useDancerSave({ errorData, loaderData, nameWarning });
  const viewTransitionStyle = useRecordTitleDetailTransitionStyle({
    detailHref: `/administracion/bailarines/${dancer.id}`,
    listHref: "/administracion/bailarines",
  });

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={`${dancer.firstName} ${dancer.lastName}`}
      titleStyle={viewTransitionStyle}
      description="Consultá y corregí la información administrativa de este bailarín."
      requireSelectedEvent={false}
      headerAction={
        <DancerDetailHeaderActions
          canEdit={loaderData.canEdit}
          canVerifyIdentity={viewState.canVerifyIdentity}
          onSelectIntent={setDialogIntent}
          onSelectMerge={() => mergeDialog.onOpenChange(true)}
          statusAction={viewState.statusAction}
        />
      }
    >
      <DancerDetailAlerts
        academyId={dancer.academy.id}
        active={dancer.active}
        canEdit={loaderData.canEdit}
        canVerifyIdentity={viewState.canVerifyIdentity}
        identificationAlert={viewState.identificationAlert}
        identificationAlertVariant={viewState.identificationAlertVariant}
        nameWarning={nameWarning?.warning}
        nameWarningFormId={editFormId}
        onSelectIntent={setDialogIntent}
        participatingAlert={viewState.participatingAlert}
        recategorisedChoreographies={
          successData?.recategorisedChoreographies ?? []
        }
      />

      <DancerDetailForm
        backToList={loaderData.backToList}
        canEdit={loaderData.canEdit}
        dancer={dancer}
        documentImageUrls={loaderData.documentImageUrls}
        editForm={editForm}
        editFormId={editFormId}
        isSaving={isSaving}
        nameWarning={nameWarning?.warning}
        onSubmit={handleEditSubmit}
        selectedEventId={loaderData.selectedEventId}
      />

      <DancerConfirmationDialog
        birthDateMayNeedRecalculation={viewState.birthDateMayNeedRecalculation}
        dialogIntent={dialogIntent}
        editConsequence={dancer.editConsequence}
        onConfirmSave={confirmSave}
        onOpenChange={(open) => {
          if (!open) {
            setDialogIntent(null);
          }
        }}
        statusAction={viewState.statusAction}
        statusFormId={statusFormId}
        verifyFormId={verifyFormId}
      />

      <RosterMergeDialog
        kind="dancer"
        merge={loaderData.merge}
        person={dancer}
        {...mergeDialog}
      />
    </AdminResourceLayout>
  );
}

/**
 * The edit form and its save: straight through, or through the confirmation
 * dialog when the save has consequences. The dialog's own `Guardar` resubmits
 * the form, marked as confirmed so it is not asked about again.
 */
function useDancerSave({
  errorData,
  loaderData,
  nameWarning,
}: {
  errorData?: Extract<DancerDetailActionData, { status: "error" }>;
  loaderData: DancerDetailLoaderData;
  nameWarning?: Extract<DancerDetailActionData, { status: "warning" }>;
}) {
  const dancer = loaderData.dancer;
  const submittedEditValues = getSubmittedDancerUpdateValues(errorData);
  const editForm = useDancerEditForm({
    actionData: errorData,
    eventStartDate: loaderData.activeEventStartDate,
    savedValues: getDancerEditValues({ actionData: undefined, dancer }),
    submittedValues:
      nameWarning?.values ??
      (submittedEditValues
        ? getDancerEditValues({ actionData: errorData, dancer })
        : null),
  });
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = isRouteFormPending(navigation, { intent: "update-dancer" });
  // Set by the confirmation dialog so its own `Guardar` is not asked about
  // again.
  const isSaveConfirmed = useRef(false);
  const [dialogIntent, setDialogIntent] = useState<DancerDialogIntent | null>(
    getInitialDialogIntent({
      actionData: errorData,
      shouldConfirmSave: dancer.editConsequence !== null,
    }),
  );
  const watchedBirthDate = editForm.form.watch("birthDate");
  const viewState = buildDancerDetailViewState({
    canEdit: loaderData.canEdit,
    dancer,
    isParticipatingInActiveEvent: loaderData.isParticipatingInActiveEvent,
    watchedBirthDate,
  });
  const submitEdit = createValidatedRouteSubmitHandler(editForm.form, submit);
  const handleEditSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    if (asksBeforeSaving && !isSaveConfirmed.current) {
      event.preventDefault();
      void editForm.form.handleSubmit(() => setDialogIntent("save"))(event);
      return;
    }

    isSaveConfirmed.current = false;
    submitEdit(event);
  };
  // The same-name warning follows a save the administrator already confirmed.
  const asksBeforeSaving = viewState.shouldConfirmSave && !nameWarning;

  function confirmSave() {
    isSaveConfirmed.current = true;
    const formElement = document.getElementById(editFormId);

    if (formElement instanceof HTMLFormElement) {
      formElement.requestSubmit();
    }
  }

  useEffect(() => {
    const nextIntent = getInitialDialogIntent({
      actionData: errorData,
      shouldConfirmSave: viewState.shouldConfirmSave,
    });

    if (!nextIntent) {
      return;
    }

    setDialogIntent(nextIntent);
  }, [errorData, viewState.shouldConfirmSave, submittedEditValues]);

  return {
    confirmSave,
    dialogIntent,
    editForm,
    handleEditSubmit,
    isSaving,
    setDialogIntent,
    viewState,
  };
}

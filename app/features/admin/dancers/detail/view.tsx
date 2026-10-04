import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type SubmitEventHandler } from "react";
import { Form, useNavigation, useSubmit } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useMergeDialogState } from "@/features/admin/merge/dialog";
import { RosterMergeDialog } from "@/features/admin/merge/roster-dialog";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  useLatestActionData,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import { useRecordTitleDetailTransitionStyle } from "@/lib/shared/view-transitions";

import { useDancerEditForm } from "./form";
import {
  buildDancerDetailViewState,
  getDancerConfirmation,
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
const confirmationFormId = "admin-dancer-confirmation-form";

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
  const latestActionData = useLatestActionData(
    actionData,
    loaderData.dancer.id,
  );

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
  } = useDancerSave({
    errorData,
    loaderData,
    nameWarning,
    refused: latestActionData,
  });
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
        active={dancer.active}
        canEdit={loaderData.canEdit}
        canVerifyIdentity={viewState.canVerifyIdentity}
        identificationAlert={viewState.identificationAlert}
        identificationAlertTitle={viewState.identificationAlertTitle}
        identificationAlertVariant={viewState.identificationAlertVariant}
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

      {/* Unmounted while closed, so the copy never changes under a dialog
          that is animating out. */}
      {dialogIntent ? (
        <DancerConfirmationDialog
          birthDateMayNeedRecalculation={
            viewState.birthDateMayNeedRecalculation
          }
          confirmation={getDancerConfirmation({
            editConsequence: dancer.editConsequence,
            intent: dialogIntent,
            statusAction: viewState.statusAction,
          })}
          onConfirmSave={confirmSave}
          onClose={() => setDialogIntent(null)}
        />
      ) : null}

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
 * The save confirms by resubmitting the edit form; archiving, reactivating and
 * verifying each post their intent through a hidden form of their own.
 */
function DancerConfirmationDialog({
  birthDateMayNeedRecalculation,
  confirmation,
  onClose,
  onConfirmSave,
}: {
  birthDateMayNeedRecalculation: boolean;
  confirmation: ReturnType<typeof getDancerConfirmation>;
  onClose: () => void;
  onConfirmSave: () => void;
}) {
  const { submittedIntent } = confirmation;

  return (
    <ConfirmationDialog
      className={submittedIntent === null ? "sm:max-w-lg" : undefined}
      confirmIcon={confirmation.confirmIcon}
      confirmLabel={confirmation.confirmLabel}
      description={confirmation.description}
      destructive={confirmation.destructive}
      form={submittedIntent === null ? undefined : confirmationFormId}
      onConfirm={submittedIntent === null ? onConfirmSave : undefined}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={confirmation.title}
    >
      {submittedIntent === null ? (
        birthDateMayNeedRecalculation ? (
          <Alert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Revisá las categorías</AlertTitle>
            <AlertDescription>
              Si cambiás la fecha de nacimiento, las coreografías vinculadas
              pueden requerir recalcular categoría desde el flujo de
              Coreografías.
            </AlertDescription>
          </Alert>
        ) : null
      ) : (
        <Form id={confirmationFormId} method="post">
          <input type="hidden" name="intent" value={submittedIntent} />
        </Form>
      )}
    </ConfirmationDialog>
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
  refused,
}: {
  errorData?: Extract<DancerDetailActionData, { status: "error" }>;
  loaderData: DancerDetailLoaderData;
  nameWarning?: Extract<DancerDetailActionData, { status: "warning" }>;
  /** The latest answer, kept so the refused values outlive a search in the
   * other tabs' lists. */
  refused?: DancerDetailActionData;
}) {
  const dancer = loaderData.dancer;
  const submittedEditValues = getSubmittedDancerUpdateValues(errorData);
  const refusedError = refused?.status === "error" ? refused : undefined;
  const editForm = useDancerEditForm({
    actionData: errorData,
    eventStartDate: loaderData.activeEventStartDate,
    savedValues: getDancerEditValues({ actionData: undefined, dancer }),
    submittedValues:
      refused?.status === "warning"
        ? refused.values
        : getSubmittedDancerUpdateValues(refusedError)
          ? getDancerEditValues({ actionData: refusedError, dancer })
          : null,
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

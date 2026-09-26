import { useEffect, useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useMergeDialogState } from "@/features/admin/merge/dialog";
import { RosterMergeDialog } from "@/features/admin/merge/roster-dialog";
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
  DancerDetailCard,
  DancerDetailHeaderActions,
  InscriptionsSection,
  type InscriptionsSectionProps,
} from "./sections";

type DancerDetailRouteViewProps = {
  actionData?: DancerDetailActionData;
  loaderData: DancerDetailLoaderData;
};

export type { InscriptionsSectionProps };
export { InscriptionsSection };

export function DancerDetailRouteView({
  actionData,
  loaderData,
}: DancerDetailRouteViewProps) {
  const errorData = actionData?.status === "error" ? actionData : undefined;
  // A warning keeps the edit open with the submitted values and asks the
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
  const submittedEditValues = getSubmittedDancerUpdateValues(errorData);
  const editForm = useDancerEditForm({
    actionData: errorData,
    eventStartDate: loaderData.activeEventStartDate,
    values:
      nameWarning?.values ??
      getDancerEditValues({ actionData: errorData, dancer }),
  });
  const [dialogIntent, setDialogIntent] = useState<DancerDialogIntent | null>(
    getInitialDialogIntent({
      actionData: errorData,
      shouldConfirmSave: dancer.editConsequence !== null,
    }),
  );
  const editFormId = "admin-dancer-edit-form";
  const statusFormId = "admin-dancer-status-form";
  const verifyFormId = "admin-dancer-verify-form";
  const watchedBirthDate = editForm.form.watch("birthDate");
  const viewTransitionStyle = useRecordTitleDetailTransitionStyle({
    detailHref: `/administracion/bailarines/${dancer.id}`,
    listHref: "/administracion/bailarines",
  });
  const viewState = buildDancerDetailViewState({
    actionData: errorData,
    canEdit: loaderData.canEdit,
    dancer,
    isParticipatingInActiveEvent: loaderData.isParticipatingInActiveEvent,
    requestedEditMode: loaderData.isEditing,
    watchedBirthDate,
  });

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
      <section className="flex flex-col gap-6">
        <DancerDetailAlerts
          active={dancer.active}
          canEdit={loaderData.canEdit}
          canVerifyIdentity={viewState.canVerifyIdentity}
          identificationAlert={viewState.identificationAlert}
          identificationAlertVariant={viewState.identificationAlertVariant}
          onSelectIntent={setDialogIntent}
          participatingAlert={viewState.participatingAlert}
          recategorisedChoreographies={
            successData?.recategorisedChoreographies ?? []
          }
        />

        <DancerDetailCard
          backToList={loaderData.backToList}
          cancelHref={loaderData.cancelHref}
          canEdit={loaderData.canEdit}
          dancer={dancer}
          documentImageUrls={loaderData.documentImageUrls}
          editForm={editForm}
          editFormId={editFormId}
          editHref={loaderData.editHref}
          isEditing={viewState.isEditing || Boolean(nameWarning)}
          nameWarning={nameWarning?.warning}
          onConfirmSave={() => {
            setDialogIntent("save");
          }}
          onSubmit={editForm.handleSubmit}
          selectedEventId={loaderData.selectedEventId}
          shouldConfirmSave={viewState.shouldConfirmSave}
        />

        <DancerConfirmationDialog
          birthDateMayNeedRecalculation={
            viewState.birthDateMayNeedRecalculation
          }
          dialogIntent={dialogIntent}
          editConsequence={dancer.editConsequence}
          editFormId={editFormId}
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
      </section>
    </AdminResourceLayout>
  );
}

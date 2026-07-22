import { useEffect, useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import { DancerConfirmationDialog } from "./confirmation-dialog";
import { useDancerEditForm, useDancerStatusForm } from "./form";
import {
  buildDancerDetailViewState,
  getDancerEditValues,
  getDancerStatusValues,
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

type AdministracionBailarinDetalleRouteViewProps = {
  actionData?: DancerDetailActionData;
  loaderData: DancerDetailLoaderData;
};

export type { InscriptionsSectionProps };
export { InscriptionsSection };

export function AdministracionBailarinDetalleRouteView({
  actionData,
  loaderData,
}: AdministracionBailarinDetalleRouteViewProps) {
  const errorData = actionData?.status === "error" ? actionData : undefined;
  const successData = actionData?.status === "success" ? actionData : undefined;

  useServerActionToast(errorData, {
    toastId: "admin-dancer-detail:error",
  });
  useServerActionToast(successData, {
    toastId: "admin-dancer-detail:success",
  });

  const dancer = loaderData.dancer;
  const submittedEditValues = getSubmittedDancerUpdateValues(errorData);
  const editForm = useDancerEditForm({
    correctionReasonRequired: dancer.correctionReasonRequired,
    values: getDancerEditValues({ actionData: errorData, dancer }),
  });
  const statusForm = useDancerStatusForm({
    correctionReasonRequired: dancer.correctionReasonRequired,
    values: getDancerStatusValues(errorData),
  });
  const [dialogIntent, setDialogIntent] = useState<DancerDialogIntent | null>(
    getInitialDialogIntent({
      actionData: errorData,
      correctionReasonRequired: dancer.correctionReasonRequired,
      statusIntent: dancer.active ? "archive-dancer" : "reactivate-dancer",
    }),
  );
  const editFormId = "admin-dancer-edit-form";
  const statusFormId = "admin-dancer-status-form";
  const verifyFormId = "admin-dancer-verify-form";
  const watchedBirthDate = editForm.form.watch("birthDate");
  const viewState = buildDancerDetailViewState({
    actionData: errorData,
    canEdit: loaderData.canEdit,
    dancer,
    requestedEditMode: loaderData.isEditing,
    watchedBirthDate,
  });

  useEffect(() => {
    const nextIntent = getInitialDialogIntent({
      actionData: errorData,
      correctionReasonRequired: dancer.correctionReasonRequired,
      statusIntent: viewState.statusAction.intent,
    });

    if (!nextIntent) {
      return;
    }

    setDialogIntent(nextIntent);
  }, [
    errorData,
    dancer.correctionReasonRequired,
    submittedEditValues,
    viewState.statusAction.intent,
  ]);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Detalle bailarín"
      description="Consultá y corregí la información administrativa de este bailarín."
      requireSelectedEvent={false}
      headerAction={
        <DancerDetailHeaderActions
          canEdit={loaderData.canEdit}
          canVerifyIdentity={viewState.canVerifyIdentity}
          onSelectIntent={setDialogIntent}
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
          isEditing={viewState.isEditing}
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
          correctionReasonRequired={dancer.correctionReasonRequired}
          dialogIntent={dialogIntent}
          editForm={editForm}
          editFormId={editFormId}
          onOpenChange={(open) => {
            if (!open) {
              setDialogIntent(null);
            }
          }}
          statusAction={viewState.statusAction}
          statusForm={statusForm}
          statusFormId={statusFormId}
          verifyFormId={verifyFormId}
        />
      </section>
    </AdminResourceLayout>
  );
}

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import { SeminarActions } from "../actions";
import { SeminarForm, SeminarFormActions, SeminarFormPanel } from "../form";
import {
  updateSeminarIntent,
  type SeminarActionData,
  type SeminarDetailLoaderData,
} from "../shared";

const updateSeminarFormId = "update-seminar-form";

export type SeminarDetailViewProps = {
  actionData?: SeminarActionData;
  initialDeleteDialogOpen?: boolean;
  loaderData: SeminarDetailLoaderData;
};

export function SeminarDetailView({
  actionData,
  initialDeleteDialogOpen = false,
  loaderData,
}: SeminarDetailViewProps) {
  useServerActionToast(actionData);

  const seminar = loaderData.seminar;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Editar seminario"
      description="Editá el instructor, la fecha, la hora y el cupo del seminario."
      headerAction={
        <SeminarActions
          seminar={seminar}
          initialDeleteDialogOpen={initialDeleteDialogOpen}
        />
      }
    >
      <SeminarFormPanel>
        <SeminarForm
          actionData={actionData}
          formId={updateSeminarFormId}
          intent={updateSeminarIntent}
          occupancy={{
            availablePlaces: seminar.availablePlaces,
            quota: seminar.quota,
          }}
          values={loaderData.values}
        />
        <SeminarFormActions
          formId={updateSeminarFormId}
          pendingScope={{ intent: updateSeminarIntent }}
          selectedEventId={loaderData.selectedEventId}
        />
      </SeminarFormPanel>
    </AdminResourceLayout>
  );
}

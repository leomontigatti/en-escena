import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { GuardAlert } from "@/components/shared/guard-alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { coveredSeminarMessage } from "@/lib/seminars/registration-refusals";
import { useServerActionToast } from "@/lib/shared/toasts";

import { SeminarActions } from "../actions";
import { SeminarInscriptionsTable } from "../inscriptions-table";
import {
  SeminarForm,
  SeminarFormActions,
  SeminarFormPanel,
  useSeminarForm,
} from "../form";
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
  const controller = useSeminarForm({
    actionData,
    intent: updateSeminarIntent,
    values: loaderData.values,
  });
  // Only a covered inscription has a standing reason: it locks fields. One that
  // only blocks the delete is said by `Eliminar` when it is clicked.
  const lockReason = loaderData.hasCoveredInscription
    ? coveredSeminarMessage
    : null;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={seminar.instructorName}
      description="Editá el instructor, su foto, el tipo, la fecha, la hora, el cupo y la seña del seminario."
      headerAction={
        <SeminarActions
          hasCoveredInscription={loaderData.hasCoveredInscription}
          seminar={seminar}
          initialDeleteDialogOpen={initialDeleteDialogOpen}
        />
      }
    >
      {/* Above the tabs, never inside one: what is locked is the seminar
          itself, so the reason reads the same from either tab. Its sentence
          names the delete as well, which is why `Eliminar` is then disabled
          without a dialog of its own. */}
      <GuardAlert reason={lockReason} />
      <Tabs defaultValue="informacion">
        <TabsList variant="line">
          <TabsTrigger value="informacion">Información</TabsTrigger>
          <TabsTrigger value="inscriptos">Inscriptos</TabsTrigger>
        </TabsList>
        {/* Kept mounted behind the other tab, so a picked picture survives a
            look at the inscriptions and the leave guard in `Guardar`'s footer
            still covers the draft from there. */}
        <TabsContent
          value="informacion"
          forceMount
          className="pt-2 data-[state=inactive]:hidden"
        >
          <SeminarFormPanel
            footer={
              <SeminarFormActions
                controller={controller}
                formId={updateSeminarFormId}
                pendingScope={{ intent: updateSeminarIntent }}
                selectedEventId={loaderData.selectedEventId}
              />
            }
          >
            <SeminarForm
              controller={controller}
              formId={updateSeminarFormId}
              hasCoveredInscription={loaderData.hasCoveredInscription}
              instructorPictureUrl={loaderData.instructorPictureUrl}
              intent={updateSeminarIntent}
              occupancy={{
                availablePlaces: seminar.availablePlaces,
                quota: seminar.quota,
              }}
              showInstructorPicture
            />
          </SeminarFormPanel>
        </TabsContent>
        <TabsContent value="inscriptos" className="pt-2">
          <SeminarInscriptionsTable inscriptions={loaderData.inscriptions} />
        </TabsContent>
      </Tabs>
    </AdminResourceLayout>
  );
}

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerActionToast } from "@/lib/shared/toasts";

import { SeminarActions } from "../actions";
import { SeminarInscriptionsTable } from "../inscriptions-table";
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
      description="Editá el instructor, su foto, la fecha, la hora y el cupo del seminario."
      headerAction={
        <SeminarActions
          seminar={seminar}
          initialDeleteDialogOpen={initialDeleteDialogOpen}
        />
      }
    >
      <Tabs defaultValue="informacion">
        <TabsList variant="line">
          <TabsTrigger value="informacion">Información</TabsTrigger>
          <TabsTrigger value="inscriptos">Inscriptos</TabsTrigger>
        </TabsList>
        <TabsContent value="informacion" className="pt-2">
          <SeminarFormPanel>
            <SeminarForm
              actionData={actionData}
              formId={updateSeminarFormId}
              instructorPictureUrl={loaderData.instructorPictureUrl}
              intent={updateSeminarIntent}
              occupancy={{
                availablePlaces: seminar.availablePlaces,
                quota: seminar.quota,
              }}
              showInstructorPicture
              values={loaderData.values}
            />
            <SeminarFormActions
              formId={updateSeminarFormId}
              pendingScope={{ intent: updateSeminarIntent }}
              selectedEventId={loaderData.selectedEventId}
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

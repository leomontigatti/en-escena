import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Editar seminario"
      description="Editá el instructor, su foto, el tipo, la fecha, la hora, el cupo y la seña del seminario."
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
            <SeminarFormActions
              controller={controller}
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

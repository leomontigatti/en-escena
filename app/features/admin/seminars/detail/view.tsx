import { InfoIcon } from "lucide-react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  coveredSeminarMessage,
  seminarHasInscriptionsMessage,
} from "@/lib/seminars/registration-refusals";
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
  const lockReason = loaderData.hasCoveredInscription
    ? coveredSeminarMessage
    : seminar.inscriptionCount > 0
      ? seminarHasInscriptionsMessage
      : null;

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
      {/* Above the tabs, never inside one: what is locked is the seminar
          itself, so the reason reads the same from either tab. A covered
          inscription is always an inscription, so its sentence already names
          the delete and the two notices never show together. */}
      <AlertStack>
        {lockReason ? (
          <Alert variant="info">
            <InfoIcon aria-hidden="true" />
            <AlertDescription>{lockReason}</AlertDescription>
          </Alert>
        ) : null}
      </AlertStack>
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

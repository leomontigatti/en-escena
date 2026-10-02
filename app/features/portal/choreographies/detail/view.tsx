import { PortalPageHeader } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { OperationalStatusSummary } from "@/features/portal/choreographies/detail/operational-status-summary";
import { ChoreographyMusicEditorForm } from "@/features/portal/choreographies/detail/music-editor-form";
import type {
  PortalChoreographyMusicActionData,
  PortalChoreographyMusicLoaderData,
} from "@/features/portal/choreographies/detail/music-editor.shared";

export type PortalChoreographyDetailRouteViewProps = {
  loaderData: PortalChoreographyMusicLoaderData;
  actionData?: PortalChoreographyMusicActionData;
};

export function PortalChoreographyDetailRouteView({
  loaderData,
  actionData,
}: PortalChoreographyDetailRouteViewProps) {
  // A withdrawn choreography is read-only in the portal, music included, so the
  // `Falta cargar …` alert would ask the academy for something it cannot do.
  const hasOperationalStatusAlert =
    !loaderData.choreography.isWithdrawn &&
    loaderData.choreography.operationalStatus.pendingItems.length > 0;

  return (
    <section
      className="flex flex-1 flex-col gap-6"
      aria-labelledby="choreography-title"
    >
      <PortalPageHeader
        titleId="choreography-title"
        title={`Editar coreografía # ${formatEventSequenceNumber(
          loaderData.choreography.choreographyNumber,
        )}`}
        description="Actualizá la música de esta coreografía. El resto de los datos se editan desde administración."
      />

      <AlertStack>
        {hasOperationalStatusAlert ? (
          <OperationalStatusSummary
            operationalStatus={loaderData.choreography.operationalStatus}
          />
        ) : null}
      </AlertStack>

      <ChoreographyMusicEditorForm
        actionData={actionData}
        loaderData={loaderData}
      />
    </section>
  );
}

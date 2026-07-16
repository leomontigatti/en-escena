import { AlertStack } from "@/components/shared/alert-stack";
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
  const hasOperationalStatusAlert =
    loaderData.choreography.operationalStatus.pendingItems.length > 0;

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="choreography-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 id="choreography-title" className="text-xl font-semibold">
            Editar coreografía
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Actualizá la música de esta coreografía. El resto de los datos se
            editan desde administración.
          </p>
        </div>
      </div>

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

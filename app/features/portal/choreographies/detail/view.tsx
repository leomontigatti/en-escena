import { PortalPageHeader } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import { ChoreographyStatusBadge } from "@/components/shared/choreography-status-badge";
import { resolveChoreographyLocks } from "@/lib/choreographies/choreography-locks";
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
  // Once the academy's pending data is closed — withdrawn, or evaluated — the
  // `Falta cargar …` alert would ask it for something it cannot do.
  const { choreography } = loaderData;
  const hasOperationalStatusAlert =
    !resolveChoreographyLocks({
      actor: "academy",
      isEvaluated: choreography.isEvaluated,
      isWithdrawn: choreography.isWithdrawn,
    }).pendingOperationalChoreographyData.locked &&
    choreography.operationalStatus.pendingItems.length > 0;

  return (
    <section
      className="flex flex-1 flex-col gap-6"
      aria-labelledby="choreography-title"
    >
      <PortalPageHeader
        titleId="choreography-title"
        title={`${loaderData.choreography.name} # ${formatEventSequenceNumber(
          loaderData.choreography.choreographyNumber,
        )}`}
        titleBadge={
          <ChoreographyStatusBadge choreography={loaderData.choreography} />
        }
        description="Actualizá la música de esta coreografía o cómo se evalúa. El resto de los datos se editan desde administración."
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

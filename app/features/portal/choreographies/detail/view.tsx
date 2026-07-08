import { Info } from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OperationalStatusSummary } from "@/features/portal/choreographies/detail/operational-status-summary";
import {
  ChoreographyRosterEditorForm,
  type ChoreographyRosterEditorActionData,
  type ChoreographyRosterEditorLoaderData,
} from "@/features/portal/choreographies/detail/roster-editor";
import type { PortalEventContext } from "@/lib/portal/event-context";
import type { ResolveChoreographyDancersResult } from "@/lib/portal/choreography-roster.server";

type PortalChoreographyDetailLoaderData = ChoreographyRosterEditorLoaderData & {
  choreography: ChoreographyRosterEditorLoaderData["choreography"] &
    Record<string, unknown>;
  deletionAvailability: {
    canDelete: boolean;
    warningMessage: string | null;
  };
  eventContext: PortalEventContext;
} & Record<string, unknown>;

export type PortalChoreographyDetailRouteViewProps = {
  loaderData: PortalChoreographyDetailLoaderData;
  actionData?: ChoreographyRosterEditorActionData;
  initialDancerResolution?: ResolveChoreographyDancersResult;
};

export function PortalChoreographyDetailRouteView({
  loaderData,
  actionData,
}: PortalChoreographyDetailRouteViewProps) {
  const hasActiveFinancialLink =
    loaderData.dancerEditingEligibility.reasonCode === "active-financial-link";
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
            Actualizá bailarines, profesores y música de esta coreografía.
          </p>
        </div>
      </div>

      <AlertStack>
        {hasActiveFinancialLink ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertDescription>
              La lista de bailarines no puede modificarse porque la coreografía
              tiene una factura o un pago relacionados.
            </AlertDescription>
          </Alert>
        ) : null}
        {hasOperationalStatusAlert ? (
          <OperationalStatusSummary
            operationalStatus={loaderData.choreography.operationalStatus}
          />
        ) : null}
      </AlertStack>

      <ChoreographyRosterEditorForm
        actionData={actionData}
        loaderData={loaderData}
      />
    </section>
  );
}

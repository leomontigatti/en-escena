import { CircleAlert, Info, TriangleAlert } from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

import type { ChoreographyDetailLoaderData } from "./server";

/**
 * The choreography conditions the page enumerates before the fields. None is
 * suppressed for the auditor: they are states of the data, not of the viewer's
 * permission.
 */
export function ChoreographyDetailAlerts({
  groupType,
  loaderData,
  noCompatibleCategory,
}: {
  groupType: ChoreographyGroupType;
  loaderData: ChoreographyDetailLoaderData;
  noCompatibleCategory: boolean;
}) {
  const choreography = loaderData.choreography;

  return (
    <AlertStack>
      {choreography.hasPresentation && loaderData.canEdit ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>La presentación bloquea esta coreografía</AlertTitle>
          <AlertDescription>
            Esta coreografía ya tiene una presentación asociada. Podés cambiar
            el nombre, pero no la modalidad, los bailarines, los profesores, la
            submodalidad, el cupo de cronograma ni el nivel de experiencia.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Not suppressed for the auditor either: it reports a state of the data.
          The choreography was left without a level its category requires — a
          date-of-birth correction, a category that had levels added to it
          later, or an old row — and the reason is stored nowhere, so the alert
          does not name it. */}
      {choreography.operationalStatus.pendingItems.includes(
        "experienceLevel",
      ) ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Falta el nivel de experiencia</AlertTitle>
          <AlertDescription>
            Esta coreografía no tiene nivel de experiencia y su categoría lo
            requiere.
            {loaderData.experienceLevel.canReassign
              ? " Elegí uno para completarla."
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* The financial alert is not suppressed for the auditor: the reason for
          the block belongs to the choreography, not to the permissions of
          whoever is looking. One block per line, with no title and no list: the
          server's label is already the whole sentence, and two blocks are two
          stacked alerts. */}
      {loaderData.scheduleCapacity.blockers.map((blocker) => (
        <Alert key={blocker.code} variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{blocker.label}</AlertDescription>
        </Alert>
      ))}

      {/* A deposit does not close the modality: it only rejects the correction
          that would move the schedule, so it is announced as a
          blocker-in-waiting. */}
      {loaderData.modality.blockers.map((blocker) => (
        <Alert key={blocker.code} variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{blocker.label}</AlertDescription>
        </Alert>
      ))}

      {noCompatibleCategory ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>No hay categoría compatible</AlertTitle>
          <AlertDescription>
            Con este elenco ({formatGroupTypeLabel(groupType)}) no existe una
            categoría válida. Ajustá los bailarines para poder guardar.
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

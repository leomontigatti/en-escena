import { Info, TriangleAlert } from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { evaluatedChoreographyMessage } from "@/lib/choreographies/choreography-messages";

import type { ChoreographyDetailLoaderData } from "./server";

/**
 * The alert names the repair that is actually open: an evaluated choreography
 * has its roster blocked, so pointing at the roster would send the reader to a
 * field that refuses the edit. The sentence does not depend on who is looking —
 * an auditor reads the same state of the data as everyone else.
 */
function formatCategoryAgeMismatchAction(isEvaluated: boolean) {
  if (isEvaluated) {
    return " La evaluación bloquea el elenco, así que la corrección es sobre la categoría. Por favor, revisala.";
  }

  return " Por favor, revisá la categoría y/o el elenco.";
}

/**
 * The choreography conditions the page enumerates before the fields. None is
 * suppressed for the auditor: they are states of the data, not of the viewer's
 * permission.
 */
export function ChoreographyDetailAlerts({
  loaderData,
}: {
  loaderData: ChoreographyDetailLoaderData;
}) {
  const choreography = loaderData.choreography;
  // The level is open whenever the category declares levels and the structure
  // is: that is the only way to complete a choreography left without one.
  const canChooseExperienceLevel =
    loaderData.canEdit &&
    loaderData.draft.structuralLock === null &&
    choreography.requiresExperienceLevel;

  return (
    <AlertStack>
      {/* The two states of the order, and they exclude each other. Being
          evaluated closes the choreography; merely holding a number does not —
          the administrator may keep correcting it, and the only thing worth
          saying is that the correction can echo on the participation list. */}
      {choreography.isEvaluated ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Esta coreografía ya fue evaluada</AlertTitle>
          <AlertDescription>
            {evaluatedChoreographyMessage}
            {/* The evaluation is the one deletion blocker there is, so it is
                said here rather than in a second alert (#454). */}
            {loaderData.deletion.canDelete
              ? ""
              : " Tampoco puede eliminarse ni retirarse."}
          </AlertDescription>
        </Alert>
      ) : choreography.presentationOrderNumber === null ? null : (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>
            Tiene la presentación n.º {choreography.presentationOrderNumber}
          </AlertTitle>
          <AlertDescription>
            Esta coreografía tiene número de presentación y modificarla puede
            necesitar atención en esa lista.
          </AlertDescription>
        </Alert>
      )}

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
            {canChooseExperienceLevel ? " Elegí uno para completarla." : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* A mis-filed placement: the choreography is still stored in a category
          that no longer admits it, which changes who competes against whom. The
          cause is stored nowhere — a concurrent category edit, a birth-date
          correction the evaluation blocked — so the alert names the state and
          not the reason. Admin-only: the portal has no lever to repair it. */}
      {choreography.operationalStatus.pendingItems.includes(
        "categoryAgeMismatch",
      ) ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>La categoría no coincide con las edades</AlertTitle>
          <AlertDescription>
            La edad con la que se ubicó esta coreografía quedó fuera del rango
            que admite {choreography.categoryName}.
            {formatCategoryAgeMismatchAction(choreography.isEvaluated)}
          </AlertDescription>
        </Alert>
      ) : null}

      {choreography.operationalStatus.pendingItems.includes(
        "experienceLevelMismatch",
      ) ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>
            El nivel de experiencia no pertenece a la categoría
          </AlertTitle>
          <AlertDescription>
            {choreography.categoryName} ya no admite el nivel de experiencia
            guardado
            {choreography.experienceLevelName === null
              ? ""
              : ` (${choreography.experienceLevelName})`}
            . Por favor, revisalo.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* The financial alert is not suppressed for the auditor: the reason for
          the block belongs to the choreography, not to the permissions of
          whoever is looking. One block per line, with no list: the server's label
          is already the whole sentence, and two blocks are two stacked
          alerts. */}
      {loaderData.scheduleCapacity.blockers.map((blocker) => (
        <Alert key={blocker.code} variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Cambios limitados por dinero asignado</AlertTitle>
          <AlertDescription>{blocker.label}</AlertDescription>
        </Alert>
      ))}

      {/* A deposit does not close the modality: it only refuses a save that
          would move the schedule, so it is announced as a blocker-in-waiting. */}
      {loaderData.modality.blockers.map((blocker) => (
        <Alert key={blocker.code} variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Cambios limitados por dinero asignado</AlertTitle>
          <AlertDescription>{blocker.label}</AlertDescription>
        </Alert>
      ))}
    </AlertStack>
  );
}

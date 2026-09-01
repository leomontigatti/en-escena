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
    <>
      {choreography.hasPresentation && loaderData.canEdit ? (
        <Alert>
          <AlertTitle>La presentación bloquea esta coreografía</AlertTitle>
          <AlertDescription>
            Esta coreografía ya tiene una presentación asociada. Podés cambiar
            el nombre, pero no la modalidad, los bailarines, los profesores, la
            submodalidad, el cupo de cronograma ni el nivel de experiencia.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Tampoco se suprime para el auditor: informa un estado de los datos.
          La coreografía quedó sin un nivel que su categoría exige —por una
          corrección de fecha de nacimiento, por una categoría a la que le
          agregaron niveles después, o por una fila vieja—, y el motivo no
          está guardado en ningún lado, así que la alerta no lo nombra. */}
      {choreography.operationalStatus.pendingItems.includes(
        "experienceLevel",
      ) ? (
        <Alert>
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

      {/* La alerta financiera no se suprime para el auditor: el motivo del
          bloqueo es información de la coreografía, no del permiso de quien
          mira. */}
      {loaderData.scheduleCapacity.blockers.length > 0 ? (
        <Alert>
          <AlertTitle>El cupo de cronograma está bloqueado</AlertTitle>
          <AlertDescription>
            <p>No se puede reasignar el cupo de cronograma:</p>
            <ul className="mt-2 list-disc pl-5">
              {loaderData.scheduleCapacity.blockers.map((blocker) => (
                <li key={blocker.code}>{blocker.label}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* A seña does not close the modalidad: it only rejects the correction
          that would move the cronograma, so it is listed as a
          blocker-in-waiting. */}
      {loaderData.modality.blockers.length > 0 ? (
        <Alert>
          <AlertTitle>La modalidad tiene un bloqueo en potencia</AlertTitle>
          <AlertDescription>
            <p>Se puede rechazar la corrección de la modalidad:</p>
            <ul className="mt-2 list-disc pl-5">
              {loaderData.modality.blockers.map((blocker) => (
                <li key={blocker.code}>{blocker.label}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {noCompatibleCategory ? (
        <Alert variant="destructive">
          <AlertTitle>No hay categoría compatible</AlertTitle>
          <AlertDescription>
            Con este elenco ({formatGroupTypeLabel(groupType)}) no existe una
            categoría válida. Ajustá los bailarines para poder guardar.
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

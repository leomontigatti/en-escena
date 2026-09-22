import { Info, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  buildRecategorisationSuffix,
  getRecategorisationReportVariant,
  recategorisationReportTitle,
  type RecategorisationSurface,
  type RecategorisedChoreography,
} from "@/lib/choreographies/recategorisation-report";

const choreographyDetailBasePath = {
  admin: "/administracion/coreografias",
  portal: "/portal/coreografias",
} as const satisfies Record<RecategorisationSurface, string>;

/**
 * What a birth-date correction changed beyond the dancer, one line per
 * choreography. Nothing to report renders nothing, so the caller can hand it
 * the action's payload without asking first.
 */
export function RecategorisedChoreographiesAlert({
  choreographies,
  surface,
}: {
  choreographies: RecategorisedChoreography[];
  surface: RecategorisationSurface;
}) {
  if (choreographies.length === 0) {
    return null;
  }

  const variant = getRecategorisationReportVariant(choreographies);

  return (
    <Alert variant={variant}>
      {variant === "warning" ? (
        <TriangleAlert aria-hidden="true" />
      ) : (
        <Info aria-hidden="true" />
      )}
      <AlertTitle>{recategorisationReportTitle}</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-1">
          {choreographies.map((choreography) => (
            <li key={choreography.choreographyId}>
              <Link
                to={`${choreographyDetailBasePath[surface]}/${choreography.choreographyId}`}
              >
                {choreography.name}
              </Link>{" "}
              {buildRecategorisationSuffix({ choreography, surface })}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

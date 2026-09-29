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

/**
 * What a birth-date correction changed beyond the dancer, one line per
 * choreography. Nothing to report renders nothing, so the caller can hand it
 * the action's payload without asking first.
 *
 * Where each line leads is the caller's: the portal's detail is the
 * choreography alone, the administration's sits under the academy.
 */
export function RecategorisedChoreographiesAlert({
  buildChoreographyHref,
  choreographies,
  surface,
}: {
  buildChoreographyHref: (choreographyId: string) => string;
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
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {choreographies.map((choreography) => (
            <li key={choreography.choreographyId}>
              <Link to={buildChoreographyHref(choreography.choreographyId)}>
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

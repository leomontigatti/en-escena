import { Info, TriangleAlert } from "lucide-react";
import { Link } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  buildRecategorisationSentence,
  getRecategorisationReportVariant,
  recategorisationReportTitle,
  type RecategorisationAudience,
  type RecategorisedChoreography,
} from "@/lib/choreographies/recategorisation-report";

const choreographyDetailBasePath = {
  academy: "/portal/coreografias",
  admin: "/administracion/coreografias",
} as const satisfies Record<RecategorisationAudience, string>;

/**
 * What a birth-date correction changed beyond the dancer, one line per
 * choreography. Nothing to report renders nothing, so the caller can hand it
 * the action's payload without asking first.
 */
export function RecategorisedChoreographiesAlert({
  audience,
  choreographies,
}: {
  audience: RecategorisationAudience;
  choreographies: RecategorisedChoreography[];
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
                className="underline underline-offset-4"
                to={`${choreographyDetailBasePath[audience]}/${choreography.choreographyId}`}
              >
                {choreography.name}
              </Link>
              {buildRecategorisationSentence({ audience, choreography })}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

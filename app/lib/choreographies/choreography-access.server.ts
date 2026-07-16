import { and, eq } from "drizzle-orm";

import { choreographies } from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-roster.shared";

type PortalOwnedChoreographyLookup = {
  academyId: string;
  choreographyId: string;
  eventId: string;
};

function portalOwnedChoreographyWhere({
  academyId,
  choreographyId,
  eventId,
}: PortalOwnedChoreographyLookup) {
  return and(
    eq(choreographies.id, choreographyId),
    eq(choreographies.academyId, academyId),
    eq(choreographies.eventId, eventId),
  );
}

function assertPortalChoreographyFound<TRecord>(
  choreography: TRecord | null | undefined,
) {
  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return choreography;
}

export { assertPortalChoreographyFound, portalOwnedChoreographyWhere };

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import {
  findPublishedProgramEvent,
  readEventProgram,
  type EventProgramRow,
  type EventProgramSchedule,
} from "@/lib/presentations/event-program.server";

/**
 * The public program's loader. It is the product's first unauthenticated
 * content route: it neither requires nor creates a session, and the only thing
 * it asks of one that happens to be there is where the top bar should point.
 */

export type PublicProgramLoaderData = {
  /** `null` when the program is not published, whichever of the two reasons. */
  event: {
    endsOn: string;
    name: string;
    startsOn: string;
  } | null;
  /** Whether the reader is signed in as an academy, which the top bar follows. */
  hasAcademySession: boolean;
  rows: EventProgramRow[];
  schedules: EventProgramSchedule[];
};

export async function loadPublicProgram(
  request: Request,
): Promise<PublicProgramLoaderData> {
  const [event, hasAcademySession] = await Promise.all([
    findPublishedProgramEvent(),
    hasAcademySessionForRequest(request),
  ]);

  if (!event) {
    return { event: null, hasAcademySession, rows: [], schedules: [] };
  }

  const program = await readEventProgram(event.id);

  return {
    event: { endsOn: event.endsOn, name: event.name, startsOn: event.startsOn },
    hasAcademySession,
    rows: program.rows,
    schedules: program.schedules,
  };
}

/**
 * Reads the session the request already carries, and nothing more: no redirect,
 * no refresh, no cookie written back. An anonymous reader is the normal case
 * here, not a failure to be sent to the login page.
 */
async function hasAcademySessionForRequest(request: Request): Promise<boolean> {
  const session = await accessAuthProvider.getAccessSession(request);

  if (!session) {
    return false;
  }

  const appUser = await db.query.user.findFirst({
    columns: { role: true },
    where: eq(user.id, session.user.id),
  });

  return appUser?.role === "academy";
}

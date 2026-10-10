import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import {
  readProgramLiveDay,
  type ProgramLive,
} from "@/features/program/live-day";
import { accessAuthProvider } from "@/lib/auth/access-auth-provider.server";
import { readPresentationEvaluationStatuses } from "@/lib/judging/evaluation-status.server";
import { judgingDate } from "@/lib/judging/judging-day";
import {
  findPublishedProgramEvent,
  readEventProgram,
  type EventProgramRow,
  type EventProgramCeremonySchedule,
} from "@/lib/presentations/event-program.server";
import { cacheFor } from "@/lib/shared/short-lived-cache";

/**
 * The public program's loader. It is the product's first unauthenticated
 * content route: it neither requires nor creates a session, and the only thing
 * it asks of one that happens to be there is where the top bar should point.
 */

export type PublicProgramLoaderData = {
  /** `null` when no day of the program is published, whichever of the two reasons. */
  event: {
    endsOn: string;
    name: string;
    startsOn: string;
  } | null;
  /** Whether the reader is signed in as an academy, which the top bar follows. */
  hasAcademySession: boolean;
  /** The day being danced, `null` with no program to dance. */
  live: ProgramLive | null;
  rows: EventProgramRow[];
  schedules: EventProgramCeremonySchedule[];
};

/**
 * How long the program read is kept in memory, and how long a browser may keep
 * the page. During the show the audience reloads and the live tab polls, and
 * this is what keeps that to a few database reads a minute.
 */
export const publicProgramCacheSeconds = 20;

/**
 * Builds the loader around its own cache. The route's answers from memory for
 * `cacheMs`; a test passes 0 so each reads the database.
 */
export function createPublicProgramLoader({ cacheMs }: { cacheMs: number }) {
  const readCachedProgram = cacheFor(cacheMs, readPublishedProgram);

  return async function loadPublicProgram(
    request: Request,
    now: Date = new Date(),
  ): Promise<PublicProgramLoaderData> {
    // The session is the reader's own, so it is never part of the cache.
    const [program, hasAcademySession] = await Promise.all([
      readCachedProgram(),
      hasAcademySessionForRequest(request),
    ]);

    if (!program) {
      return {
        event: null,
        hasAcademySession,
        live: null,
        rows: [],
        schedules: [],
      };
    }

    return {
      event: program.event,
      hasAcademySession,
      live: {
        day: readProgramLiveDay({
          now,
          evaluatedChoreographyIds: program.evaluatedChoreographyIds,
          rows: program.rows,
          schedules: program.schedules,
        }),
        loadedOn: judgingDate(now),
      },
      rows: program.rows,
      schedules: program.schedules,
    };
  };
}

export const loadPublicProgram = createPublicProgramLoader({
  cacheMs: publicProgramCacheSeconds * 1000,
});

async function readPublishedProgram() {
  const event = await findPublishedProgramEvent();

  if (!event) {
    return null;
  }

  // Only the published days: a day still hidden may be reordered, so neither
  // its rows nor its schedules, ceremonies included, leave the server.
  const program = await readEventProgram(event.id, undefined, {
    days: event.visibleDays,
  });
  const statuses = await readPresentationEvaluationStatuses(
    program.rows.map((row) => row.choreographyId),
  );

  return {
    event: { endsOn: event.endsOn, name: event.name, startsOn: event.startsOn },
    // Scored and disqualified alike: the program never says which.
    evaluatedChoreographyIds: new Set(statuses.keys()),
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

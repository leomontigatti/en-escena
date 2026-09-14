import { inArray, sql } from "drizzle-orm";

import { dancers, professors } from "@/db/schema";
import { activeInscriptionSql } from "@/lib/choreographies/active-inscription";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";

/**
 * `Participando` means being on a roster, so a withdrawn inscription must not
 * answer it: the row survives to hold its money and its comprobante line, not to
 * claim the dancer is still in the event. These two `exists` are hand-built SQL
 * rather than query-builder calls, which is why they take the raw-SQL twin of
 * the predicate and pass it the alias they gave the table.
 */
const participationInscriptionAlias = "participation_choreography_dancer";

export function buildDancerEventParticipationSql(
  selectedEventId: string | null,
) {
  if (selectedEventId === null) {
    return sql<boolean>`false`;
  }

  return sql<boolean>`exists (
    select 1
    from ${sql.identifier("en_escena_choreography_dancer")} participation_choreography_dancer
    inner join ${sql.identifier("en_escena_choreography")} participation_choreography
      on participation_choreography.id = participation_choreography_dancer.choreography_id
    where participation_choreography_dancer.dancer_id = ${sql.identifier("en_escena_dancer")}.${sql.identifier("id")}
      and participation_choreography.event_id = ${selectedEventId}
      and ${activeInscriptionSql(participationInscriptionAlias)}
  )`;
}

export function buildDancerAnyEventParticipationSql() {
  return sql<boolean>`exists (
    select 1
    from ${sql.identifier("en_escena_choreography_dancer")} participation_choreography_dancer
    where participation_choreography_dancer.dancer_id = ${sql.identifier("en_escena_dancer")}.${sql.identifier("id")}
      and ${activeInscriptionSql(participationInscriptionAlias)}
  )`;
}

export function buildProfessorEventParticipationSql(
  selectedEventId: string | null,
) {
  if (selectedEventId === null) {
    return sql<boolean>`false`;
  }

  return sql<boolean>`exists (
    select 1
    from ${sql.identifier("en_escena_choreography_professor")} participation_choreography_professor
    inner join ${sql.identifier("en_escena_choreography")} participation_choreography
      on participation_choreography.id = participation_choreography_professor.choreography_id
    where participation_choreography_professor.professor_id = ${sql.identifier("en_escena_professor")}.${sql.identifier("id")}
      and participation_choreography.event_id = ${selectedEventId}
  )`;
}

export function buildProfessorAnyEventParticipationSql() {
  return sql<boolean>`exists (
    select 1
    from ${sql.identifier("en_escena_choreography_professor")} participation_choreography_professor
    where participation_choreography_professor.professor_id = ${sql.identifier("en_escena_professor")}.${sql.identifier("id")}
  )`;
}

/**
 * Whether each of the named people is `Participando` in one event. It is the
 * same two `exists` above, asked about a set of roster rows at once, which is
 * what the seminar price resolution needs: the participant cell of an
 * inscription is read **on the roster row the inscription names**, so a person
 * dancing for academy A and registered into a seminar by academy B is a
 * non-participant on B's row.
 *
 * A person the map does not name is not participating; the caller reads it as
 * `false` rather than as unknown, because absence here means no roster row
 * answered.
 */
export async function readEventParticipation(
  executor: Executor,
  input: {
    dancerIds: string[];
    eventId: string;
    professorIds: string[];
  },
): Promise<{
  dancerIds: Set<string>;
  professorIds: Set<string>;
}> {
  const [dancerRows, professorRows] = await Promise.all([
    input.dancerIds.length === 0
      ? []
      : executor
          .select({
            id: dancers.id,
            participating: buildDancerEventParticipationSql(input.eventId),
          })
          .from(dancers)
          .where(inArray(dancers.id, input.dancerIds)),
    input.professorIds.length === 0
      ? []
      : executor
          .select({
            id: professors.id,
            participating: buildProfessorEventParticipationSql(input.eventId),
          })
          .from(professors)
          .where(inArray(professors.id, input.professorIds)),
  ]);

  return {
    dancerIds: new Set(
      dancerRows.filter((row) => row.participating).map((row) => row.id),
    ),
    professorIds: new Set(
      professorRows.filter((row) => row.participating).map((row) => row.id),
    ),
  };
}

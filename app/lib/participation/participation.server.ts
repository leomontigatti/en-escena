import { sql } from "drizzle-orm";

import { activeInscriptionSql } from "@/lib/choreographies/active-inscription";

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

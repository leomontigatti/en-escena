import { sql } from "drizzle-orm";

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
  )`;
}

export function buildDancerAnyEventParticipationSql() {
  return sql<boolean>`exists (
    select 1
    from ${sql.identifier("en_escena_choreography_dancer")} participation_choreography_dancer
    where participation_choreography_dancer.dancer_id = ${sql.identifier("en_escena_dancer")}.${sql.identifier("id")}
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

import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  seminarInscriptions,
  seminars,
} from "@/db/schema";
import {
  createAcademySession,
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import { withdrawChoreographyForTest } from "@/lib/choreographies/withdrawn-choreography.test-support";
import {
  createEventChoreographyFixture,
  createSavedEvent,
} from "@/lib/events/bases-test-fixtures.server.db";
import { hasActiveEventParticipation } from "@/lib/roster/active-event-participation.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const WITHDRAWN_AT = new Date("2030-05-01T12:00:00Z");

describe("active event participation reader", () => {
  test("answers true for a dancer with a live inscription in the active event", async () => {
    const { academyId, activeEvent } = await createRoster("Participa");
    const dancer = await createDancer(academyId, {
      firstName: "Ana",
      lastName: "Vive",
    });
    await createEventChoreographyFixture({
      academyId,
      dancerIds: [dancer.id],
      eventId: activeEvent.id,
      name: "Fragmentada",
    });

    await expect(participationOf("dancer", dancer.id)).resolves.toBe(true);
  });

  test("answers true for a professor linked to a choreography of the active event", async () => {
    const { academyId, activeEvent } = await createRoster("Profesora");
    const professor = await createProfessor(academyId, {
      firstName: "Luz",
      lastName: "Dicta",
    });
    await createEventChoreographyFixture({
      academyId,
      eventId: activeEvent.id,
      name: "Fragmentada",
      professorIds: [professor.id],
    });

    await expect(participationOf("professor", professor.id)).resolves.toBe(
      true,
    );
  });

  test("answers false when the dancer's only inscription is withdrawn", async () => {
    const { academyId, activeEvent } = await createRoster("Baja");
    const dancer = await createDancer(academyId, {
      firstName: "Bea",
      lastName: "Baja",
    });
    await createEventChoreographyFixture({
      academyId,
      dancerIds: [dancer.id],
      eventId: activeEvent.id,
      name: "Fragmentada",
    });
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: WITHDRAWN_AT })
      .where(eq(choreographyDancers.dancerId, dancer.id));

    await expect(participationOf("dancer", dancer.id)).resolves.toBe(false);
  });

  test("answers false when the choreography itself is withdrawn, for both kinds", async () => {
    const { academyId, activeEvent } = await createRoster("Coreo Baja");
    const [dancer, professor] = await Promise.all([
      createDancer(academyId, { firstName: "Cami", lastName: "Baja" }),
      createProfessor(academyId, { firstName: "Dana", lastName: "Baja" }),
    ]);
    const choreography = await createEventChoreographyFixture({
      academyId,
      dancerIds: [dancer.id],
      eventId: activeEvent.id,
      name: "Fragmentada",
      professorIds: [professor.id],
    });
    await withdrawChoreographyForTest(choreography.id, WITHDRAWN_AT);

    await expect(participationOf("dancer", dancer.id)).resolves.toBe(false);
    await expect(participationOf("professor", professor.id)).resolves.toBe(
      false,
    );
  });

  test("answers true for a live seminar inscription of the active event, for both kinds", async () => {
    const { academyId, activeEvent } = await createRoster("Seminario");
    const [dancer, professor] = await Promise.all([
      createDancer(academyId, { firstName: "Sol", lastName: "Asiste" }),
      createProfessor(academyId, { firstName: "Tai", lastName: "Asiste" }),
    ]);
    const seminar = await createEventSeminar(activeEvent.id);
    await db.insert(seminarInscriptions).values([
      { dancerId: dancer.id, seminarId: seminar.id },
      { professorId: professor.id, seminarId: seminar.id },
    ]);

    await expect(participationOf("dancer", dancer.id)).resolves.toBe(true);
    await expect(participationOf("professor", professor.id)).resolves.toBe(
      true,
    );
  });

  test("answers false when the only seminar inscription is withdrawn", async () => {
    const { academyId, activeEvent } = await createRoster("Seminario Baja");
    const dancer = await createDancer(academyId, {
      firstName: "Emi",
      lastName: "Baja",
    });
    const seminar = await createEventSeminar(activeEvent.id);
    await db.insert(seminarInscriptions).values({
      dancerId: dancer.id,
      seminarId: seminar.id,
      withdrawnAt: WITHDRAWN_AT,
    });

    await expect(participationOf("dancer", dancer.id)).resolves.toBe(false);
  });

  test("answers false for commitments that only exist in a past event", async () => {
    const academy = await createAcademySession({
      academyName: "Academia Pasada",
      email: "pasada.academia@example.com",
    });
    const pastEvent = await createSavedEvent("En Escena Pasado");
    await createSavedEvent("En Escena Activo", { activate: true });
    const [dancer, professor] = await Promise.all([
      createDancer(academy.academyId, { firstName: "Flor", lastName: "Ayer" }),
      createProfessor(academy.academyId, {
        firstName: "Gala",
        lastName: "Ayer",
      }),
    ]);
    await createEventChoreographyFixture({
      academyId: academy.academyId,
      dancerIds: [dancer.id],
      eventId: pastEvent.id,
      name: "Fragmentada",
      professorIds: [professor.id],
    });
    const seminar = await createEventSeminar(pastEvent.id);
    await db
      .insert(seminarInscriptions)
      .values({ dancerId: dancer.id, seminarId: seminar.id });

    await expect(participationOf("dancer", dancer.id)).resolves.toBe(false);
    await expect(participationOf("professor", professor.id)).resolves.toBe(
      false,
    );
  });

  test("answers false when no event is active", async () => {
    const academy = await createAcademySession({
      academyName: "Academia Sin Evento",
      email: "sin.evento.academia@example.com",
    });
    const event = await createSavedEvent("En Escena Inactivo");
    const dancer = await createDancer(academy.academyId, {
      firstName: "Hana",
      lastName: "Espera",
    });
    await createEventChoreographyFixture({
      academyId: academy.academyId,
      dancerIds: [dancer.id],
      eventId: event.id,
      name: "Fragmentada",
    });

    await expect(participationOf("dancer", dancer.id)).resolves.toBe(false);
  });
});

function participationOf(
  kind: Parameters<typeof hasActiveEventParticipation>[0]["kind"],
  personId: string,
) {
  return hasActiveEventParticipation({ kind, personId });
}

async function createRoster(academyName: string) {
  const academy = await createAcademySession({
    academyName: `Academia ${academyName}`,
    email: `${crypto.randomUUID()}@example.com`,
  });
  const activeEvent = await createSavedEvent("En Escena Activo", {
    activate: true,
  });

  return { academyId: academy.academyId, activeEvent };
}

async function createEventSeminar(eventId: string) {
  const [seminar] = await db
    .insert(seminars)
    .values({
      eventId,
      instructorName: "Abril Sosa",
      quota: 20,
      scheduledDate: "2030-10-10",
      startTime: "18:30",
    })
    .returning();

  return seminar;
}

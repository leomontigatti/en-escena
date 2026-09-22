import { describe, expect, test } from "vitest";

import {
  createAcademySession,
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  createEventChoreographyFixture,
  createSavedEvent,
} from "@/lib/events/bases-test-fixtures.server.db";
import { findActiveEventParticipation } from "@/lib/roster/active-event-participation.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("active event participation reader", () => {
  test("answers true for a dancer with a live inscription in the active event", async () => {
    const academy = await createAcademySession({
      academyName: "Academia Participa",
      email: "participa.academia@example.com",
    });
    const event = await createSavedEvent("En Escena Activo", {
      activate: true,
    });
    const dancer = await createDancer(academy.academyId, {
      firstName: "Ana",
      lastName: "Vive",
    });
    await createEventChoreographyFixture({
      academyId: academy.academyId,
      dancerIds: [dancer.id],
      eventId: event.id,
      name: "Fragmentada",
    });

    await expect(
      findActiveEventParticipation({ kind: "dancer", personId: dancer.id }),
    ).resolves.toBe(true);
  });

  test("answers true for a professor linked to a choreography of the active event", async () => {
    const academy = await createAcademySession({
      academyName: "Academia Profesora",
      email: "profesora.academia@example.com",
    });
    const event = await createSavedEvent("En Escena Activo", {
      activate: true,
    });
    const professor = await createProfessor(academy.academyId, {
      firstName: "Luz",
      lastName: "Dicta",
    });
    await createEventChoreographyFixture({
      academyId: academy.academyId,
      eventId: event.id,
      name: "Fragmentada",
      professorIds: [professor.id],
    });

    await expect(
      findActiveEventParticipation({
        kind: "professor",
        personId: professor.id,
      }),
    ).resolves.toBe(true);
  });
});

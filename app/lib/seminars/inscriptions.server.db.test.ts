import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { dancers, seminarInscriptions } from "@/db/schema";
import {
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createSavedEvent } from "@/lib/events/bases-test-fixtures.server.db";
import {
  listSeminarInscriptionsForAcademy,
  listSeminarPersonOptionsForAcademy,
  registerSeminarInscription,
  type RegisterSeminarInscriptionResult,
} from "@/lib/seminars/inscriptions.server";
import { createSeminar, listSeminars } from "@/lib/seminars/repository.server";
import { createAcademyUser } from "@/lib/test-support/academies";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// One minute before and one minute after 2026-10-10 18:30 in business time.
const beforeStart = new Date("2026-10-10T21:29:00.000Z");
const afterStart = new Date("2026-10-10T21:31:00.000Z");

async function createSeminarFixture(quota = 2) {
  const event = await createSavedEvent("Regional 2026");
  const seminar = await createSeminar(event.id, {
    instructorName: "Abril Sosa",
    scheduledDate: "2026-10-10",
    startTime: "18:30",
    quota,
  });

  if (!seminar.ok) {
    throw new Error(`Expected the seminar to be saved: ${seminar.error}`);
  }

  return { eventId: event.id, seminar: seminar.seminar };
}

async function createAcademy(name: string) {
  const { academy } = await createAcademyUser({
    academyName: name,
    email: `${crypto.randomUUID()}@example.com`,
  });

  return academy;
}

function expectRegistered(result: RegisterSeminarInscriptionResult) {
  if (!result.ok) {
    throw new Error(`Expected the inscription to be saved: ${result.error}`);
  }

  return result.inscriptionId;
}

describe("seminar inscriptions", () => {
  test("registers a dancer and a professor of the academy and reads them back", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Inscripciones");
    const dancer = await createDancer(academy.id, {
      firstName: "Abril",
      lastName: "Sosa",
    });
    const professor = await createProfessor(academy.id, {
      firstName: "Beto",
      lastName: "Luna",
    });

    expectRegistered(
      await registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: beforeStart,
        personId: dancer.id,
        personKind: "dancer",
        seminarId: seminar.id,
      }),
    );
    expectRegistered(
      await registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: beforeStart,
        personId: professor.id,
        personKind: "professor",
        seminarId: seminar.id,
      }),
    );

    await expect(
      listSeminarInscriptionsForAcademy({ academyId: academy.id, eventId }),
    ).resolves.toMatchObject([
      { fullName: "Abril Sosa", personKind: "dancer", seminarId: seminar.id },
      { fullName: "Beto Luna", personKind: "professor", seminarId: seminar.id },
    ]);
    await expect(listSeminars(eventId)).resolves.toMatchObject([
      { id: seminar.id, availablePlaces: 0 },
    ]);
  });

  test("takes the last place and refuses the next one until the quota is raised", async () => {
    const { eventId, seminar } = await createSeminarFixture(1);
    const academy = await createAcademy("Academia Cupo");
    const first = await createDancer(academy.id, { firstName: "Uno" });
    const second = await createDancer(academy.id, { firstName: "Dos" });
    const register = (personId: string) =>
      registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: beforeStart,
        personId,
        personKind: "dancer" as const,
        seminarId: seminar.id,
      });

    expectRegistered(await register(first.id));

    await expect(register(second.id)).resolves.toMatchObject({
      ok: false,
      code: "full",
      error: "Sin lugares disponibles.",
    });
  });

  test("leaves exactly one winner when two inscriptions race for the last place", async () => {
    const { eventId, seminar } = await createSeminarFixture(1);
    const academy = await createAcademy("Academia Carrera");
    const first = await createDancer(academy.id, { firstName: "Uno" });
    const second = await createDancer(academy.id, { firstName: "Dos" });
    const register = (personId: string) =>
      registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: beforeStart,
        personId,
        personKind: "dancer" as const,
        seminarId: seminar.id,
      });

    const results = await Promise.all([
      register(first.id),
      register(second.id),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toMatchObject([
      { code: "full" },
    ]);
    await expect(
      db
        .select({ id: seminarInscriptions.id })
        .from(seminarInscriptions)
        .where(eq(seminarInscriptions.seminarId, seminar.id)),
    ).resolves.toHaveLength(1);
  });

  test("refuses once the seminar has started", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Tarde");
    const dancer = await createDancer(academy.id);

    await expect(
      registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: afterStart,
        personId: dancer.id,
        personKind: "dancer",
        seminarId: seminar.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "started",
      error: "El seminario ya comenzó.",
    });
  });

  test("refuses an archived person, a person of another academy and a second inscription of the same person", async () => {
    const { eventId, seminar } = await createSeminarFixture(5);
    const academy = await createAcademy("Academia Elegibilidad");
    const otherAcademy = await createAcademy("Academia Ajena");
    const archived = await createDancer(academy.id, {
      firstName: "Archivada",
      active: false,
    });
    const stranger = await createDancer(otherAcademy.id, {
      firstName: "Ajena",
    });
    const active = await createDancer(academy.id, { firstName: "Activa" });
    const register = (personId: string) =>
      registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: beforeStart,
        personId,
        personKind: "dancer" as const,
        seminarId: seminar.id,
      });

    await expect(register(archived.id)).resolves.toMatchObject({
      ok: false,
      code: "ineligible-person",
    });
    await expect(register(stranger.id)).resolves.toMatchObject({
      ok: false,
      code: "ineligible-person",
    });
    expectRegistered(await register(active.id));
    await expect(register(active.id)).resolves.toMatchObject({
      ok: false,
      code: "already-registered",
    });
  });

  test("keeps an archived person listed once registered and leaves them out of the picker", async () => {
    const { eventId, seminar } = await createSeminarFixture(5);
    const academy = await createAcademy("Academia Archivo");
    const dancer = await createDancer(academy.id, {
      firstName: "Abril",
      lastName: "Sosa",
    });

    expectRegistered(
      await registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: beforeStart,
        personId: dancer.id,
        personKind: "dancer",
        seminarId: seminar.id,
      }),
    );
    await db
      .update(dancers)
      .set({ active: false })
      .where(eq(dancers.id, dancer.id));

    await expect(
      listSeminarInscriptionsForAcademy({ academyId: academy.id, eventId }),
    ).resolves.toMatchObject([{ fullName: "Abril Sosa" }]);
    await expect(
      listSeminarPersonOptionsForAcademy(academy.id),
    ).resolves.toEqual([]);
  });

  test("refuses a seminar of another event", async () => {
    const { seminar } = await createSeminarFixture();
    const otherEvent = await createSavedEvent("Regional 2027");
    const academy = await createAcademy("Academia Otro Evento");
    const dancer = await createDancer(academy.id);

    await expect(
      registerSeminarInscription({
        academyId: academy.id,
        eventId: otherEvent.id,
        now: beforeStart,
        personId: dancer.id,
        personKind: "dancer",
        seminarId: seminar.id,
      }),
    ).resolves.toMatchObject({ ok: false, code: "seminar-not-found" });
  });

  test("offers the academy's active dancers and professors in one list ordered by name", async () => {
    const academy = await createAcademy("Academia Plantel");
    await createDancer(academy.id, { firstName: "Beto", lastName: "Luna" });
    await createProfessor(academy.id, { firstName: "Abril", lastName: "Sosa" });
    await createProfessor(academy.id, {
      firstName: "Carla",
      lastName: "Vera",
      active: false,
    });

    await expect(
      listSeminarPersonOptionsForAcademy(academy.id),
    ).resolves.toMatchObject([
      { fullName: "Abril Sosa", kind: "professor" },
      { fullName: "Beto Luna", kind: "dancer" },
    ]);
  });

  test("refuses at the database a row with both person columns or with neither", async () => {
    const { seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Check");
    const dancer = await createDancer(academy.id);
    const professor = await createProfessor(academy.id);

    await expect(
      db.insert(seminarInscriptions).values({
        seminarId: seminar.id,
        dancerId: dancer.id,
        professorId: professor.id,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(seminarInscriptions).values({ seminarId: seminar.id }),
    ).rejects.toThrow();
  });
});

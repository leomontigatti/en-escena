import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { dancers, seminarInscriptions, seminarPrices } from "@/db/schema";
import {
  createDancer,
  createProfessor,
} from "@/lib/choreographies/registration.test-support";
import {
  deleteSeminarInscriptionForAcademy,
  removeSeminarInscription,
  registerSeminarInscription,
  type RegisterSeminarInscriptionResult,
} from "@/lib/seminars/inscriptions.server";
import {
  listSeminarInscriptions,
  listSeminarInscriptionsForAcademy,
  listSeminarPersonOptionsForAcademy,
} from "@/lib/seminars/inscription-rosters.server";
import { lockEventSeminarPricesForEdit } from "@/lib/seminar-prices/price-locks.server";
import { createSeminarPrice } from "@/lib/seminar-prices/repository.server";
import { createSeminarRegistrationPrices } from "@/lib/seminar-prices/seminar-prices.test-support";
import { readSeminarInscriptionFinanceRows } from "@/lib/finances/seminar-inscriptions.server";
import { createSeminar, listSeminars } from "@/lib/seminars/repository.server";
import {
  coverSeminarInscriptionDeposit,
  readSeminarPlaceLedger,
} from "@/lib/seminars/seminars.test-support";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSavedEvent, eventDates } from "@/lib/test-support/events";
import {
  createIndividualUser,
  createLinkedIndividualUser,
} from "@/lib/test-support/individuals";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../tests/db/harness";
import { runBehindAHolder } from "../../../tests/db/lock-contention";

installDatabaseTestHooks();

// One minute before and one minute after 2026-10-10 18:30 in business time.
const beforeStart = new Date("2026-10-10T21:29:00.000Z");
const afterStart = new Date("2026-10-10T21:31:00.000Z");

/** A seminar of an event whose price list opens registration, unless
 * `withPrices` is false: "the event has no prices" is a state a test asks for. */
async function createSeminarFixture(quota = 2, { withPrices = true } = {}) {
  const event = await createSavedEvent({
    name: "Regional 2026",
    active: false,
    ...eventDates(2030),
  });
  const seminar = await createSeminar(event.id, {
    instructorName: "Abril Sosa",
    scheduledDate: "2026-10-10",
    startTime: "18:30",
    quota,
    ...defaultSeminarFacts,
  });

  if (!seminar.ok) {
    throw new Error(`Expected the seminar to be saved: ${seminar.error}`);
  }

  if (withPrices) {
    await createSeminarRegistrationPrices(event.id);
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

/** The registration the quota and delete tests repeat: an open seminar, an
 * active dancer of the academy, before the start. */
function registerDancerBeforeStart(input: {
  academyId: string;
  eventId: string;
  personId: string;
  seminarId: string;
}) {
  return registerSeminarInscription({
    ...input,
    now: beforeStart,
    personKind: "dancer",
  });
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
    // Nobody covered a deposit, so the quota is untouched and both rows are on
    // the roster: registration does not spend places.
    await expect(listSeminars(eventId, new Date())).resolves.toMatchObject([
      { id: seminar.id, availablePlaces: 2, registeredCount: 2 },
    ]);
  });

  test("registers past the quota, because a place is taken by money and not by the roster", async () => {
    const { eventId, seminar } = await createSeminarFixture(1);
    const academy = await createAcademy("Academia Cupo");
    const first = await createDancer(academy.id, { firstName: "Uno" });
    const second = await createDancer(academy.id, { firstName: "Dos" });
    const register = (personId: string) =>
      registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId,
        seminarId: seminar.id,
      });

    expectRegistered(await register(first.id));
    expectRegistered(await register(second.id));

    await expect(listSeminars(eventId, new Date())).resolves.toMatchObject([
      { id: seminar.id, availablePlaces: 1, registeredCount: 2 },
    ]);
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
      registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId,
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
    const otherEvent = await createSavedEvent({
      name: "Regional 2027",
      active: false,
      ...eventDates(2030),
    });
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

  test("deletes the academy's own inscription and leaves the row gone", async () => {
    const { eventId, seminar } = await createSeminarFixture(1);
    const academy = await createAcademy("Academia Baja");
    const first = await createDancer(academy.id, { firstName: "Uno" });
    const second = await createDancer(academy.id, { firstName: "Dos" });
    const register = (personId: string) =>
      registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId,
        seminarId: seminar.id,
      });
    const inscriptionId = expectRegistered(await register(first.id));

    await expect(
      deleteSeminarInscriptionForAcademy({
        academyId: academy.id,
        eventId,
        inscriptionId,
        now: beforeStart,
      }),
    ).resolves.toEqual({ ok: true, withdrawn: false });

    // The row is gone rather than marked, so nothing of it is left to revive.
    await expect(
      db
        .select({ id: seminarInscriptions.id })
        .from(seminarInscriptions)
        .where(eq(seminarInscriptions.id, inscriptionId)),
    ).resolves.toEqual([]);
    expectRegistered(await register(second.id));
  });

  test("refuses the academy's delete once the seminar has started", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Tarde Baja");
    const dancer = await createDancer(academy.id);
    const inscriptionId = expectRegistered(
      await registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: beforeStart,
        personId: dancer.id,
        personKind: "dancer",
        seminarId: seminar.id,
      }),
    );

    await expect(
      deleteSeminarInscriptionForAcademy({
        academyId: academy.id,
        eventId,
        inscriptionId,
        now: afterStart,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "started",
      error: "El seminario ya comenzó.",
    });
    await expect(
      db
        .select({ id: seminarInscriptions.id })
        .from(seminarInscriptions)
        .where(eq(seminarInscriptions.id, inscriptionId)),
    ).resolves.toHaveLength(1);
  });

  test("refuses to delete an inscription of another academy or of another event", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Dueña");
    const otherAcademy = await createAcademy("Academia Ajena Baja");
    const otherEvent = await createSavedEvent({
      name: "Regional 2027",
      active: false,
      ...eventDates(2030),
    });
    const professor = await createProfessor(academy.id);
    const inscriptionId = expectRegistered(
      await registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: beforeStart,
        personId: professor.id,
        personKind: "professor",
        seminarId: seminar.id,
      }),
    );
    const deleteAs = (input: { academyId: string; eventId: string }) =>
      deleteSeminarInscriptionForAcademy({
        ...input,
        inscriptionId,
        now: beforeStart,
      });

    await expect(
      deleteAs({ academyId: otherAcademy.id, eventId }),
    ).resolves.toMatchObject({ ok: false, code: "inscription-not-found" });
    await expect(
      deleteAs({ academyId: academy.id, eventId: otherEvent.id }),
    ).resolves.toMatchObject({ ok: false, code: "inscription-not-found" });
    await expect(
      db
        .select({ id: seminarInscriptions.id })
        .from(seminarInscriptions)
        .where(eq(seminarInscriptions.id, inscriptionId)),
    ).resolves.toHaveLength(1);
  });
});

describe("the administrative reading of a seminar's inscriptions", () => {
  // #1479: the two roster halves are read in one query now, so the kind and
  // the academy have to come off the right side of each row.
  test("interleaves the dancers and professors of several academies by academy, then name (#1479)", async () => {
    const { eventId, seminar } = await createSeminarFixture(6);
    const north = await createAcademy("Academia Norte");
    const south = await createAcademy("Academia Sur");
    const people = [
      { academy: south, kind: "dancer", firstName: "Abril", lastName: "Sosa" },
      {
        academy: north,
        kind: "professor",
        firstName: "Beto",
        lastName: "Luna",
      },
      { academy: south, kind: "professor", firstName: "Ana", lastName: "Paz" },
      { academy: north, kind: "dancer", firstName: "Carla", lastName: "Vera" },
      { academy: north, kind: "dancer", firstName: "Ada", lastName: "Gil" },
    ] as const;

    for (const person of people) {
      const name = { firstName: person.firstName, lastName: person.lastName };
      const created =
        person.kind === "dancer"
          ? await createDancer(person.academy.id, name)
          : await createProfessor(person.academy.id, name);

      expectRegistered(
        await registerSeminarInscription({
          academyId: person.academy.id,
          eventId,
          now: beforeStart,
          personId: created.id,
          personKind: person.kind,
          seminarId: seminar.id,
        }),
      );
    }

    await expect(listSeminarInscriptions(seminar.id)).resolves.toMatchObject([
      {
        fullName: "Ada Gil",
        personKind: "dancer",
        academyName: "Academia Norte",
      },
      {
        fullName: "Beto Luna",
        personKind: "professor",
        academyName: "Academia Norte",
      },
      {
        fullName: "Carla Vera",
        personKind: "dancer",
        academyName: "Academia Norte",
      },
      {
        fullName: "Abril Sosa",
        personKind: "dancer",
        academyName: "Academia Sur",
      },
      {
        fullName: "Ana Paz",
        personKind: "professor",
        academyName: "Academia Sur",
      },
    ]);
    await expect(
      listSeminarInscriptionsForAcademy({ academyId: north.id, eventId }),
    ).resolves.toMatchObject([
      { fullName: "Ada Gil", personKind: "dancer", academyId: north.id },
      { fullName: "Beto Luna", personKind: "professor", academyId: north.id },
      { fullName: "Carla Vera", personKind: "dancer", academyId: north.id },
    ]);
  });

  test("removes an inscription after the seminar started and frees its place", async () => {
    const { eventId, seminar } = await createSeminarFixture(1);
    const academy = await createAcademy("Academia Inscripciones");
    const dancer = await createDancer(academy.id, {
      firstName: "Abril",
      lastName: "Sosa",
    });
    const other = await createDancer(academy.id, {
      firstName: "Beto",
      lastName: "Sosa",
    });
    const inscriptionId = expectRegistered(
      await registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId: dancer.id,
        seminarId: seminar.id,
      }),
    );

    // The academy itself is past its cut-off.
    await expect(
      deleteSeminarInscriptionForAcademy({
        academyId: academy.id,
        eventId,
        inscriptionId,
        now: afterStart,
      }),
    ).resolves.toMatchObject({ ok: false, code: "started" });

    await expect(
      removeSeminarInscription({
        inscriptionId,
        seminarId: seminar.id,
      }),
    ).resolves.toEqual({ ok: true, withdrawn: false });
    await expect(listSeminarInscriptions(seminar.id)).resolves.toEqual([]);
    await expect(listSeminars(eventId, new Date())).resolves.toMatchObject([
      { id: seminar.id, availablePlaces: 1, registeredCount: 0 },
    ]);

    // Somebody else takes the row's place on the roster, which is what the
    // removal is the valve for.
    expectRegistered(
      await registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId: other.id,
        seminarId: seminar.id,
      }),
    );
  });

  test("reports an inscription of another seminar as missing", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Inscripciones");
    const dancer = await createDancer(academy.id, {
      firstName: "Abril",
      lastName: "Sosa",
    });
    const inscriptionId = expectRegistered(
      await registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId: dancer.id,
        seminarId: seminar.id,
      }),
    );

    await expect(
      removeSeminarInscription({
        inscriptionId,
        seminarId: "seminar_missing",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "inscription-not-found",
      error: "No encontramos esa inscripción.",
    });
    await expect(listSeminarInscriptions(seminar.id)).resolves.toHaveLength(1);
  });

  // A direct POST used to register while the portal footer said
  // registration was closed: the price check lived in the view alone.
  test("refuses a registration while a participant cell has no price, whichever side registers", async () => {
    const { eventId, seminar } = await createSeminarFixture(2, {
      withPrices: false,
    });
    const academy = await createAcademy("Academia Sin Precios");
    const dancer = await createDancer(academy.id);
    const individual = await createIndividualUser({
      email: `${crypto.randomUUID()}@example.com`,
    });
    // Only the participant cell: the other one would resolve to no price.
    await createSeminarPrice(eventId, {
      name: "Participante",
      kind: "regular",
      forParticipants: true,
      paymentDeadline: null,
      amount: 20000,
    });

    await expect(
      registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId: dancer.id,
        seminarId: seminar.id,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "prices-missing",
      error: "Las inscripciones a este seminario todavía no están abiertas.",
    });
    await expect(
      registerSeminarInscription({
        academyId: individual.ownerId,
        eventId,
        now: beforeStart,
        personId: individual.individualId,
        personKind: "individual",
        seminarId: seminar.id,
      }),
    ).resolves.toMatchObject({ ok: false, code: "prices-missing" });
    await expect(listSeminarInscriptions(seminar.id)).resolves.toEqual([]);
  });
});

// #1665: an individual (`Particular`) registers itself, owned by its own owner
// row, under the academies' rules.
describe("an individual's own seminar inscription", () => {
  async function createIndividual(
    name = { firstName: "Clara", lastName: "Ríos" },
  ) {
    return createIndividualUser({
      email: `${crypto.randomUUID()}@example.com`,
      ...name,
    });
  }

  function registerIndividual(
    individual: { individualId: string; ownerId: string },
    input: { eventId: string; seminarId: string; now?: Date },
  ) {
    return registerSeminarInscription({
      academyId: individual.ownerId,
      eventId: input.eventId,
      now: input.now ?? beforeStart,
      personId: individual.individualId,
      personKind: "individual",
      seminarId: input.seminarId,
    });
  }

  /** Whether the inscription holds a reserved place, as every quota reading
   * counts it. */
  async function holdsReservation(seminarId: string, inscriptionId: string) {
    return (
      (await readSeminarPlaceLedger(seminarId, beforeStart)).holdingOf(
        inscriptionId,
      ) === "reserved"
    );
  }

  test("registers itself, reserves a free place and is read back as a `Particular`", async () => {
    const { eventId, seminar } = await createSeminarFixture(2);
    const academy = await createAcademy("Academia Norte");
    const dancer = await createDancer(academy.id, {
      firstName: "Abril",
      lastName: "Sosa",
    });
    const individual = await createIndividual();

    const inscriptionId = expectRegistered(
      await registerIndividual(individual, {
        eventId,
        seminarId: seminar.id,
      }),
    );
    expectRegistered(
      await registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId: dancer.id,
        seminarId: seminar.id,
      }),
    );

    await expect(holdsReservation(seminar.id, inscriptionId)).resolves.toBe(
      true,
    );
    await expect(
      listSeminarInscriptionsForAcademy({
        academyId: individual.ownerId,
        eventId,
      }),
    ).resolves.toMatchObject([
      {
        id: inscriptionId,
        fullName: "Clara Ríos",
        personId: individual.individualId,
        personKind: "individual",
        seminarId: seminar.id,
      },
    ]);
    // Administration reads it beside the academies' rows, and it counts as
    // one more on the roster.
    await expect(listSeminarInscriptions(seminar.id)).resolves.toMatchObject([
      { fullName: "Abril Sosa", personKind: "dancer" },
      { id: inscriptionId, fullName: "Clara Ríos", personKind: "individual" },
    ]);
    await expect(listSeminars(eventId, new Date())).resolves.toMatchObject([
      { id: seminar.id, registeredCount: 2 },
    ]);
  });

  test("registers into a full seminar without a place, and covering the deposit takes one", async () => {
    const { eventId, seminar } = await createSeminarFixture(1);
    const academy = await createAcademy("Academia Llena");
    const dancer = await createDancer(academy.id);
    const individual = await createIndividual();
    const dancerInscriptionId = expectRegistered(
      await registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId: dancer.id,
        seminarId: seminar.id,
      }),
    );

    const inscriptionId = expectRegistered(
      await registerIndividual(individual, {
        eventId,
        seminarId: seminar.id,
      }),
    );
    await expect(holdsReservation(seminar.id, inscriptionId)).resolves.toBe(
      false,
    );

    // The academy's row frees the place; the individual's money takes it.
    await removeSeminarInscription({
      inscriptionId: dancerInscriptionId,
      seminarId: seminar.id,
    });
    await coverSeminarInscriptionDeposit({
      academyId: individual.ownerId,
      eventId,
      inscriptionId,
      seminarId: seminar.id,
    });

    expect((await readSeminarPlaceLedger(seminar.id)).coveredCount).toBe(1);
  });

  test("refuses a second inscription of itself and somebody else's individual", async () => {
    const { eventId, seminar } = await createSeminarFixture(5);
    const individual = await createIndividual();
    const other = await createIndividual({
      firstName: "Dora",
      lastName: "Vega",
    });

    expectRegistered(
      await registerIndividual(individual, {
        eventId,
        seminarId: seminar.id,
      }),
    );

    await expect(
      registerIndividual(individual, { eventId, seminarId: seminar.id }),
    ).resolves.toMatchObject({ ok: false, code: "already-registered" });
    await expect(
      registerSeminarInscription({
        academyId: individual.ownerId,
        eventId,
        now: beforeStart,
        personId: other.individualId,
        personKind: "individual",
        seminarId: seminar.id,
      }),
    ).resolves.toMatchObject({ ok: false, code: "ineligible-person" });
  });

  test("closes registration and its own removal when the seminar starts, but not administration's", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const individual = await createIndividual();
    const inscriptionId = expectRegistered(
      await registerIndividual(individual, {
        eventId,
        seminarId: seminar.id,
      }),
    );
    const late = await createIndividual({
      firstName: "Dora",
      lastName: "Vega",
    });

    await expect(
      registerIndividual(late, {
        eventId,
        now: afterStart,
        seminarId: seminar.id,
      }),
    ).resolves.toMatchObject({ ok: false, code: "started" });
    await expect(
      deleteSeminarInscriptionForAcademy({
        academyId: individual.ownerId,
        eventId,
        inscriptionId,
        now: afterStart,
      }),
    ).resolves.toMatchObject({ ok: false, code: "started" });
    await expect(
      removeSeminarInscription({ inscriptionId, seminarId: seminar.id }),
    ).resolves.toEqual({ ok: true, withdrawn: false });
    await expect(listSeminarInscriptions(seminar.id)).resolves.toEqual([]);
  });

  test("deletes its inscription without money and withdraws one with money", async () => {
    const { eventId, seminar } = await createSeminarFixture(5);
    const individual = await createIndividual();
    const register = () =>
      registerIndividual(individual, { eventId, seminarId: seminar.id });
    const removeOwn = (inscriptionId: string) =>
      deleteSeminarInscriptionForAcademy({
        academyId: individual.ownerId,
        eventId,
        inscriptionId,
        now: beforeStart,
      });

    const unpaid = expectRegistered(await register());
    await expect(removeOwn(unpaid)).resolves.toEqual({
      ok: true,
      withdrawn: false,
    });
    // Deleted rather than withdrawn: not even the finance read, which keeps
    // withdrawn rows, still has it.
    await expect(
      readSeminarInscriptionFinanceRows({
        academyId: individual.ownerId,
        eventId,
        seminarId: seminar.id,
      }),
    ).resolves.toEqual([]);

    const paid = expectRegistered(await register());
    await coverSeminarInscriptionDeposit({
      academyId: individual.ownerId,
      eventId,
      inscriptionId: paid,
      seminarId: seminar.id,
    });
    await expect(removeOwn(paid)).resolves.toEqual({
      ok: true,
      withdrawn: true,
    });

    // A withdrawal is final: registering again is a new row beside it.
    const again = expectRegistered(await register());
    expect(again).not.toBe(paid);
    await expect(
      listSeminarInscriptionsForAcademy({
        academyId: individual.ownerId,
        eventId,
      }),
    ).resolves.toMatchObject([{ id: again }]);
  });

  test("is not an academy's to remove", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Ajena");
    const individual = await createIndividual();
    const inscriptionId = expectRegistered(
      await registerIndividual(individual, {
        eventId,
        seminarId: seminar.id,
      }),
    );

    await expect(
      deleteSeminarInscriptionForAcademy({
        academyId: academy.id,
        eventId,
        inscriptionId,
        now: beforeStart,
      }),
    ).resolves.toMatchObject({ ok: false, code: "inscription-not-found" });
  });
});

// #1666: one person holds one inscription per seminar, whichever side made it,
// once the individual's link is confirmed.
describe("the same person registered from both sides", () => {
  const documentNumber = "30123456";

  function registerIndividual(
    individual: { individualId: string; ownerId: string },
    input: { eventId: string; seminarId: string },
  ) {
    return registerSeminarInscription({
      academyId: individual.ownerId,
      eventId: input.eventId,
      now: beforeStart,
      personId: individual.individualId,
      personKind: "individual",
      seminarId: input.seminarId,
    });
  }

  function createLinkedIndividual() {
    return createLinkedIndividualUser({
      documentNumber,
      email: `${crypto.randomUUID()}@example.com`,
    });
  }

  test("refuses the individual, naming the academy, when a row its link reaches holds an inscription", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Norte");
    const dancer = await createDancer(academy.id, {
      documentType: "dni",
      documentNumber: "30.123.456",
    });
    expectRegistered(
      await registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId: dancer.id,
        seminarId: seminar.id,
      }),
    );
    const individual = await createLinkedIndividual();

    await expect(
      registerIndividual(individual, { eventId, seminarId: seminar.id }),
    ).resolves.toEqual({
      ok: false,
      code: "registered-by-academy",
      error: "Academia Norte ya te inscribió en este seminario.",
    });
  });

  test("lets the individual register once the academy's inscription is withdrawn", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Norte");
    const professor = await createProfessor(academy.id, {
      documentType: "dni",
      documentNumber,
    });
    const academyInscriptionId = expectRegistered(
      await registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: beforeStart,
        personId: professor.id,
        personKind: "professor",
        seminarId: seminar.id,
      }),
    );
    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: beforeStart })
      .where(eq(seminarInscriptions.id, academyInscriptionId));
    const individual = await createLinkedIndividual();

    expectRegistered(
      await registerIndividual(individual, { eventId, seminarId: seminar.id }),
    );
  });

  test("refuses the academy when a linked individual already holds an inscription", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Norte");
    const dancer = await createDancer(academy.id, {
      documentType: "dni",
      documentNumber,
    });
    const professor = await createProfessor(academy.id, {
      documentType: "dni",
      documentNumber,
    });
    const individual = await createLinkedIndividual();
    expectRegistered(
      await registerIndividual(individual, { eventId, seminarId: seminar.id }),
    );

    await expect(
      registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId: dancer.id,
        seminarId: seminar.id,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "registered-as-individual",
      error: "Ya está inscripto como particular.",
    });
    await expect(
      registerSeminarInscription({
        academyId: academy.id,
        eventId,
        now: beforeStart,
        personId: professor.id,
        personKind: "professor",
        seminarId: seminar.id,
      }),
    ).resolves.toMatchObject({ ok: false, code: "registered-as-individual" });
  });

  test("refuses neither side without a confirmed link", async () => {
    const { eventId, seminar } = await createSeminarFixture();
    const academy = await createAcademy("Academia Norte");
    const dancer = await createDancer(academy.id, {
      documentType: "dni",
      documentNumber,
    });
    // `Pendiente`: the photo is there, nobody confirmed it.
    const pending = await createIndividualUser({
      documentNumber,
      documentPhotoStorageKey: "individuals/photo.jpg",
      email: `${crypto.randomUUID()}@example.com`,
    });
    expectRegistered(
      await registerIndividual(pending, { eventId, seminarId: seminar.id }),
    );

    expectRegistered(
      await registerDancerBeforeStart({
        academyId: academy.id,
        eventId,
        personId: dancer.id,
        seminarId: seminar.id,
      }),
    );

    const other = await createSeminarFixture();
    const otherAcademy = await createAcademy("Academia Sur");
    const otherDancer = await createDancer(otherAcademy.id, {
      documentType: "dni",
      documentNumber,
    });
    expectRegistered(
      await registerDancerBeforeStart({
        academyId: otherAcademy.id,
        eventId: other.eventId,
        personId: otherDancer.id,
        seminarId: other.seminar.id,
      }),
    );

    expectRegistered(
      await registerIndividual(pending, {
        eventId: other.eventId,
        seminarId: other.seminar.id,
      }),
    );
  });
});

/**
 * A registration reads whether the price list covers every participant cell,
 * and a price edit refuses to uncover a cell while the event has an active
 * inscription (`removesNeverExpiringCoverage`). Each reads what the other has
 * not committed yet unless they serialise on the event's price list: a
 * registration queued behind an edit that uncovers a cell reads the uncovered
 * list and refuses, instead of leaving an inscription no price resolves.
 *
 * Postgres only: the fast suite's single PGlite connection serialises the
 * transactions on its own.
 */
describe.skipIf(isPgliteTestBackend())(
  "a registration against a price edit that uncovers a cell",
  () => {
    test("a registration queued behind the edit refuses the uncovered event", async () => {
      const { eventId, seminar } = await createSeminarFixture();
      const academy = await createAcademy("Academia Carrera");
      const dancer = await createDancer(academy.id);

      const registration = await runBehindAHolder({
        waitingOn: "seminar price list lock",
        hold: (tx) => lockEventSeminarPricesForEdit(tx, eventId),
        contender: () =>
          registerDancerBeforeStart({
            academyId: academy.id,
            eventId,
            personId: dancer.id,
            seminarId: seminar.id,
          }),
        // What deleting the participant cell's deadline-less row writes, once
        // its guard found no active inscription.
        beforeCommit: (tx) =>
          tx
            .delete(seminarPrices)
            .where(
              and(
                eq(seminarPrices.eventId, eventId),
                eq(seminarPrices.forParticipants, true),
              ),
            ),
      });

      expect(registration).toMatchObject({
        ok: false,
        code: "prices-missing",
      });
      await expect(
        db
          .select({ id: seminarInscriptions.id })
          .from(seminarInscriptions)
          .where(eq(seminarInscriptions.seminarId, seminar.id)),
      ).resolves.toEqual([]);
    });
  },
);

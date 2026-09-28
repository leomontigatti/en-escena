import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  professors,
} from "@/db/schema";
import { activateEvent } from "@/lib/events/management.server";
import {
  createPortalSavedEvent as createSavedEvent,
  testEventDate as date,
} from "@/lib/events/saved-event-test-support.server";
import { CREATE_CHOREOGRAPHY_INTENT } from "@/features/portal/choreographies/create/flow";
import {
  handleCreateChoreographyAction,
  loadCreateChoreographyRouteData,
} from "@/features/portal/choreographies/create/server";
import {
  choreographyCreationFormData,
  createChoreographyRegistrationScenario,
} from "@/features/portal/choreographies/test-support/registration-scenario";
import {
  createAcademySession,
  createPortalPostRequest,
  expectThrownResponse,
} from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

function createPageRequest(cookie: string) {
  return new Request("http://localhost/portal/coreografias/crear", {
    headers: { cookie },
  });
}

describe("the create choreography page loader", () => {
  test("offers the event's modalities and the academy's active roster people", async () => {
    const { event, modality, ownerSession, submodality } =
      await createChoreographyRegistrationScenario({
        academyName: "Academia Crear Coreografía",
        email: "crear.coreografia@example.com",
      });
    await db.insert(dancers).values({
      academyId: ownerSession.academyId,
      firstName: "Bea",
      lastName: "Archivada",
      birthDate: "2014-01-01",
      active: false,
    });
    await db.insert(professors).values({
      academyId: ownerSession.academyId,
      firstName: "Mar",
      lastName: "Archivada",
      active: false,
    });

    const data = await loadCreateChoreographyRouteData(
      createPageRequest(ownerSession.cookie),
    );

    expect(data.eventId).toBe(event.id);
    expect(data.activeDancers.map((dancer) => dancer.firstName)).toEqual([
      "Ana",
    ]);
    expect(
      data.activeProfessors.map((professor) => professor.firstName),
    ).toEqual(["Luz"]);
    expect(data.registrationBaseOptions).toEqual({
      modalities: [{ id: modality.id, name: "Jazz" }],
      submodalities: [
        { id: submodality.id, modalityId: modality.id, name: "Lyrical" },
      ],
    });
  });

  test("offers no roster person of another academy", async () => {
    const { ownerSession } = await createChoreographyRegistrationScenario({
      academyName: "Academia Propia",
      email: "crear.coreografia.propia@example.com",
    });
    const otherAcademy = await createAcademySession({
      academyName: "Academia Ajena",
      email: "crear.coreografia.ajena@example.com",
    });
    await db.insert(dancers).values({
      academyId: otherAcademy.academyId,
      firstName: "Ajena",
      lastName: "Activa",
      birthDate: "2014-01-01",
      active: true,
    });
    await db.insert(professors).values({
      academyId: otherAcademy.academyId,
      firstName: "Ajeno",
      lastName: "Activo",
      active: true,
    });

    const data = await loadCreateChoreographyRouteData(
      createPageRequest(ownerSession.cookie),
    );

    expect(data.activeDancers.map((dancer) => dancer.firstName)).toEqual([
      "Ana",
    ]);
    expect(
      data.activeProfessors.map((professor) => professor.firstName),
    ).toEqual(["Luz"]);
  });

  test("sends the academy back to the list while registration is not possible", async () => {
    const session = await createAcademySession({
      academyName: "Academia Sin Inscripciones",
      email: "crear.coreografia.cerrada@example.com",
    });
    const event = await createSavedEvent({
      name: "Regional Sin Bases",
      startsAt: date("2026-07-01T12:00:00Z"),
      endsAt: date("2026-07-03T12:00:00Z"),
    });
    await activateEvent(event.id);
    await db.insert(dancers).values({
      academyId: session.academyId,
      firstName: "Ana",
      lastName: "Activa",
      birthDate: "2014-01-01",
      active: true,
    });

    const response = await expectThrownResponse(
      loadCreateChoreographyRouteData(createPageRequest(session.cookie)),
      302,
    );

    expect(response.headers.get("Location")).toBe("/portal/coreografias");
  });

  test("sends the academy back to the list when it has no active dancer", async () => {
    const { ownerSession } = await createChoreographyRegistrationScenario({
      academyName: "Academia Sin Bailarines",
      email: "crear.coreografia.sin.bailarines@example.com",
    });
    await db
      .update(dancers)
      .set({ active: false })
      .where(eq(dancers.academyId, ownerSession.academyId));

    const response = await expectThrownResponse(
      loadCreateChoreographyRouteData(createPageRequest(ownerSession.cookie)),
      302,
    );

    expect(response.headers.get("Location")).toBe("/portal/coreografias");
  });
});

describe("the create choreography page action", () => {
  test("creates the choreography and redirects back to the list", async () => {
    const scenario = await createChoreographyRegistrationScenario({
      email: "coreografias.create.owner@example.com",
      academyName: "Academia Creadora",
    });
    const {
      category,
      dancer,
      event,
      level,
      ownerSession,
      professor,
      scheduleCapacity,
      modality,
      submodality,
    } = scenario;

    const response = await expectThrownResponse(
      handleCreateChoreographyAction(
        createPortalPostRequest(
          `http://localhost/portal/coreografias/crear?evento=${event.id}`,
          ownerSession.cookie,
          choreographyCreationFormData({
            eventId: event.id,
            name: " danza de la luna ",
            modalityId: modality.id,
            submodalityId: submodality.id,
            dancerIds: [dancer.id],
            professorIds: [professor.id],
            experienceLevelId: level.id,
            scheduleCapacityId: scheduleCapacity.id,
          }),
        ),
      ),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/portal/coreografias?creada=1",
    );

    const [storedChoreography] = await db.query.choreographies.findMany({
      where: eq(choreographies.academyId, ownerSession.academyId),
    });
    expect(storedChoreography).toMatchObject({
      eventId: event.id,
      name: "Danza de la Luna",
      categoryId: category.id,
      experienceLevelId: level.id,
      scheduleCapacityId: scheduleCapacity.id,
    });

    const storedDancers = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, storedChoreography.id),
    });
    expect(storedDancers).toHaveLength(1);

    const storedProfessors = await db.query.choreographyProfessors.findMany({
      where: eq(choreographyProfessors.choreographyId, storedChoreography.id),
    });
    expect(storedProfessors).toHaveLength(1);
  });

  test("answers with the duplicate warning instead of creating, and creates once the academy sends the ids it saw", async () => {
    const {
      dancer,
      event,
      level,
      modality,
      ownerSession,
      professor,
      scheduleCapacity,
      submodality,
    } = await createChoreographyRegistrationScenario({
      email: "coreografias.create.duplicada@example.com",
      academyName: "Academia Repetida",
    });

    function submitCreation(acknowledgedDuplicateIds: string[] = []) {
      return handleCreateChoreographyAction(
        createPortalPostRequest(
          `http://localhost/portal/coreografias/crear?evento=${event.id}`,
          ownerSession.cookie,
          choreographyCreationFormData({
            acknowledgedDuplicateIds,
            eventId: event.id,
            name: "Danza de la Luna",
            modalityId: modality.id,
            submodalityId: submodality.id,
            dancerIds: [dancer.id],
            professorIds: [professor.id],
            experienceLevelId: level.id,
            scheduleCapacityId: scheduleCapacity.id,
          }),
        ),
      );
    }

    await expectThrownResponse(submitCreation(), 302);

    const warned = await submitCreation();
    const warning = expectDuplicateChoreographyWarning(warned);

    expect(warning.matches).toMatchObject([
      { choreographyNumber: 1, name: "Danza de la Luna" },
    ]);
    await expect(
      db.query.choreographies.findMany({
        where: eq(choreographies.academyId, ownerSession.academyId),
      }),
    ).resolves.toHaveLength(1);

    await expectThrownResponse(
      submitCreation(warning.matches.map((match) => match.id)),
      302,
    );

    await expect(
      db.query.choreographies.findMany({
        where: eq(choreographies.academyId, ownerSession.academyId),
      }),
    ).resolves.toHaveLength(2);
  });
});

function expectDuplicateChoreographyWarning(
  data: Awaited<ReturnType<typeof handleCreateChoreographyAction>>,
) {
  if (
    data.intent !== CREATE_CHOREOGRAPHY_INTENT ||
    data.result.ok ||
    data.result.code !== "duplicate-choreography"
  ) {
    throw new Error("Expected the duplicate choreography warning.");
  }

  return data.result.warning;
}

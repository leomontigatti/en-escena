import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyProfessors,
  professors,
} from "@/db/schema";
import { createAcademySession } from "@/features/portal/test-support/db";
import { expectCreated } from "@/lib/events/bases-test-fixtures.server.db";
import { createModality } from "@/lib/modalities/repository.server";
import { activateEvent } from "@/lib/events/management.server";
import { createPortalSavedEvent as createSavedEvent } from "@/lib/events/saved-event-test-support.server";
import { createFormData } from "@/lib/test-support/form-data";
import {
  handlePortalProfessorsListAction,
  loadPortalProfessorsList,
} from "@/features/portal/professors/list/server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("loadPortalProfessorsList", () => {
  test("creates normalized professors and loads active plus archived rows for client filtering", async () => {
    const owner = await createAcademySession({
      email: "profesores.owner@example.com",
      academyName: "Academia Dueña",
    });
    const other = await createAcademySession({
      email: "profesores.other@example.com",
      academyName: "Academia Ajena",
    });

    await db.insert(professors).values({
      academyId: owner.academyId,
      firstName: "Ana",
      lastName: "Zapata",
    });
    await db.insert(professors).values({
      academyId: owner.academyId,
      firstName: "Bea",
      lastName: "Archivada",
      active: false,
    });
    await db.insert(professors).values({
      academyId: other.academyId,
      firstName: "Ajeno",
      lastName: "Alvarez",
    });

    const createResult = await handlePortalProfessorsListAction(
      new Request("http://localhost/portal/profesores", {
        method: "POST",
        headers: { cookie: owner.cookie },
        body: createFormData({
          intent: "create-professor",
          firstName: "  jOSÉ  luis ",
          lastName: " de la CRUZ ",
        }),
      }),
    );

    expect(createResult).toEqual({
      status: "success",
      message: "Profesor creado.",
    });

    const loaderData = await loadPortalProfessorsList(
      new Request("http://localhost/portal/profesores", {
        headers: { cookie: owner.cookie },
      }),
    );

    expect(loaderData.professors).toEqual([
      expect.objectContaining({
        firstName: "Ana",
        lastName: "Zapata",
        active: true,
        documentType: null,
        documentNumber: null,
        isIncomplete: true,
      }),
      expect.objectContaining({
        firstName: "Bea",
        lastName: "Archivada",
        active: false,
        documentType: null,
        documentNumber: null,
        isIncomplete: true,
      }),
      expect.objectContaining({
        firstName: "José Luis",
        lastName: "de la Cruz",
        active: true,
        documentType: null,
        documentNumber: null,
        isIncomplete: true,
      }),
    ]);
  });

  test("marks professors linked to active event choreographies as participating", async () => {
    const event = await createSavedEvent({ name: "En Escena 2026" });
    await activateEvent(event.id);
    const session = await createAcademySession({
      email: "profesores.participacion@example.com",
      academyName: "Academia Participacion Profesores",
    });
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: session.academyId,
        firstName: "Paula",
        lastName: "Participa",
      })
      .returning();
    const [choreography] = await db
      .insert(choreographies)
      .values({
        academyId: session.academyId,
        eventId: event.id,
        name: "Solo activo",
        groupType: "solo",
        modalityId: modality.id,
        categoryCalculationMode: "oldest",
      })
      .returning();
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
    });

    const loaderData = await loadPortalProfessorsList(
      new Request("http://localhost/portal/profesores", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(loaderData.professors).toMatchObject([
      {
        firstName: "Paula",
        lastName: "Participa",
        participationStatus: "participating",
      },
    ]);
  });
});

import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import {
  handlePortalProfessorDetailAction,
  loadPortalProfessorDetail,
} from "@/features/portal/professors/detail/server";
import { loadPortalProfessorsList } from "@/features/portal/professors/list/server";
import {
  createAcademySession,
  createPortalPostRequest,
  expectThrownResponse,
} from "@/features/portal/test-support/db";
import {
  expectPersistedProfessor,
  expectPersonDetailRedirect,
} from "@/lib/test-support/person-detail-db-assertions";
import { createFormData } from "@/lib/test-support/form-data";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("handlePortalProfessorDetailAction", () => {
  test("updates a professor in place with normalized document data", async () => {
    const owner = await createAcademySession({
      email: "profesores.edit.owner@example.com",
      academyName: "Academia Dueña",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Perez",
      })
      .returning();

    const response = await expectThrownResponse(
      handlePortalProfessorDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${professor.id}`,
          owner.cookie,
          createFormData({
            firstName: "  maría del carmen ",
            lastName: " de la cruz ",
            documentType: "dni",
            documentNumber: "12.345-678",
          }),
        ),
        params: { professorId: professor.id },
      }),
      302,
    );

    expectPersonDetailRedirect(
      response,
      `/portal/profesores/${professor.id}?notificacion=profesor-guardado`,
    );
    await expectPersistedProfessor(professor.id, {
      firstName: "María del Carmen",
      lastName: "de la Cruz",
      documentType: "dni",
      documentNumber: "12345678",
    });

    const loaderData = await loadPortalProfessorDetail({
      request: new Request(
        `http://localhost/portal/profesores/${professor.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
      params: { professorId: professor.id },
    });

    expect(loaderData.professor.isIncomplete).toBe(false);
  });

  test("keeps submitted values and field errors when the document pair is incomplete", async () => {
    const owner = await createAcademySession({
      email: "profesores.validation.owner@example.com",
      academyName: "Academia Dueña",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Perez",
      })
      .returning();

    const result = await handlePortalProfessorDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/profesores/${professor.id}`,
        owner.cookie,
        createFormData({
          firstName: "Ana",
          lastName: "Perez",
          documentType: "dni",
          documentNumber: "",
        }),
      ),
      params: { professorId: professor.id },
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber: "Ingresá el número de documento.",
      },
      values: {
        firstName: "Ana",
        lastName: "Perez",
        documentType: "dni",
        documentNumber: "",
      },
    });
    await expectPersistedProfessor(professor.id, {
      documentType: null,
      documentNumber: null,
    });
  });

  test("rejects a duplicate complete document within the same Academia", async () => {
    const owner = await createAcademySession({
      email: "profesores.duplicate.owner@example.com",
      academyName: "Academia Dueña",
    });
    await db.insert(professors).values({
      academyId: owner.academyId,
      firstName: "Ana",
      lastName: "Perez",
      documentType: "dni",
      documentNumber: "12345678",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Bea",
        lastName: "Lopez",
      })
      .returning();

    const result = await handlePortalProfessorDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/profesores/${professor.id}`,
        owner.cookie,
        createFormData({
          firstName: "Bea",
          lastName: "Lopez",
          documentType: "dni",
          documentNumber: "12 345 678",
        }),
      ),
      params: { professorId: professor.id },
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un Profesor con ese documento en tu academia.",
      },
    });
  });

  test("allows the same complete document in another Academia", async () => {
    const owner = await createAcademySession({
      email: "profesores.cross-academy.owner@example.com",
      academyName: "Academia Dueña",
    });
    const other = await createAcademySession({
      email: "profesores.cross-academy.other@example.com",
      academyName: "Academia Ajena",
    });
    await db.insert(professors).values({
      academyId: other.academyId,
      firstName: "Ajena",
      lastName: "Profesora",
      documentType: "passport",
      documentNumber: "AR 123",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Propia",
        lastName: "Profesora",
      })
      .returning();

    await expectThrownResponse(
      handlePortalProfessorDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${professor.id}`,
          owner.cookie,
          createFormData({
            firstName: "Propia",
            lastName: "Profesora",
            documentType: "passport",
            documentNumber: "AR 123",
          }),
        ),
        params: { professorId: professor.id },
      }),
      302,
    );

    await expectPersistedProfessor(professor.id, {
      documentType: "passport",
      documentNumber: "AR 123",
    });
  });

  test("allows the same complete document once as professor and once as dancer in the same Academia", async () => {
    const owner = await createAcademySession({
      email: "profesores.cross-role.owner@example.com",
      academyName: "Academia Dueña",
    });
    await db.insert(dancers).values({
      academyId: owner.academyId,
      firstName: "Bailarina",
      lastName: "Dual",
      birthDate: "2010-05-10",
      documentType: "other",
      documentNumber: "AB 123",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Profesora",
        lastName: "Dual",
      })
      .returning();

    await expectThrownResponse(
      handlePortalProfessorDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${professor.id}`,
          owner.cookie,
          createFormData({
            firstName: "Profesora",
            lastName: "Dual",
            documentType: "other",
            documentNumber: "AB 123",
          }),
        ),
        params: { professorId: professor.id },
      }),
      302,
    );

    await expectPersistedProfessor(professor.id, {
      documentType: "other",
      documentNumber: "AB 123",
    });
  });

  test("returns not found when another Academia loads or updates the professor", async () => {
    const owner = await createAcademySession({
      email: "profesores.not-found.owner@example.com",
      academyName: "Academia Dueña",
    });
    const other = await createAcademySession({
      email: "profesores.not-found.other@example.com",
      academyName: "Academia Ajena",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Perez",
      })
      .returning();

    await expectThrownResponse(
      loadPortalProfessorDetail({
        request: new Request(
          `http://localhost/portal/profesores/${professor.id}`,
          {
            headers: { cookie: other.cookie },
          },
        ),
        params: { professorId: professor.id },
      }),
      404,
    );

    await expectThrownResponse(
      handlePortalProfessorDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${professor.id}`,
          other.cookie,
          createFormData({
            firstName: "Otra",
            lastName: "Persona",
            documentType: "",
            documentNumber: "",
          }),
        ),
        params: { professorId: professor.id },
      }),
      404,
    );
  });

  test("archives and reactivates a professor while keeping direct URL access", async () => {
    const owner = await createAcademySession({
      email: "profesores.archive.owner@example.com",
      academyName: "Academia Archivo",
    });
    const [activeProfessor, archivedProfessor] = await db
      .insert(professors)
      .values([
        {
          academyId: owner.academyId,
          firstName: "Ana",
          lastName: "Activa",
        },
        {
          academyId: owner.academyId,
          firstName: "Bea",
          lastName: "Archivada",
          active: false,
        },
      ])
      .returning();

    const archiveResponse = await expectThrownResponse(
      handlePortalProfessorDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${activeProfessor.id}`,
          owner.cookie,
          createFormData({ intent: "archive-professor" }),
        ),
        params: { professorId: activeProfessor.id },
      }),
      302,
    );

    expectPersonDetailRedirect(
      archiveResponse,
      `/portal/profesores/${activeProfessor.id}?notificacion=profesor-archivado`,
    );
    await expectPersistedProfessor(activeProfessor.id, { active: false });

    const baseListData = await loadPortalProfessorsList(
      new Request("http://localhost/portal/profesores", {
        headers: { cookie: owner.cookie },
      }),
    );
    expect(baseListData.professors).toMatchObject([
      { id: activeProfessor.id, active: false },
      { id: archivedProfessor.id, active: false },
    ]);

    const archivedDetailData = await loadPortalProfessorDetail({
      request: new Request(
        `http://localhost/portal/profesores/${activeProfessor.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
      params: { professorId: activeProfessor.id },
    });
    expect(archivedDetailData.professor).toMatchObject({
      id: activeProfessor.id,
      active: false,
    });

    const reactivateResponse = await expectThrownResponse(
      handlePortalProfessorDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${activeProfessor.id}`,
          owner.cookie,
          createFormData({ intent: "reactivate-professor" }),
        ),
        params: { professorId: activeProfessor.id },
      }),
      302,
    );

    expectPersonDetailRedirect(
      reactivateResponse,
      `/portal/profesores/${activeProfessor.id}?notificacion=profesor-reactivado`,
    );
    await expectPersistedProfessor(activeProfessor.id, { active: true });
  });
});

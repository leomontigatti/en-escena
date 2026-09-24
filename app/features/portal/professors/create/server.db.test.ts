import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import { handleCreateProfessorAction } from "@/features/portal/professors/create/server";
import { createAcademySession } from "@/features/portal/test-support/db";
import { acknowledgedDuplicateIdsField } from "@/lib/shared/duplicate-warning";
import { createFormData } from "@/lib/test-support/form-data";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

const { findProfessorDocumentConflictMock } = vi.hoisted(() => ({
  findProfessorDocumentConflictMock: vi.fn(),
}));

vi.mock("@/lib/portal/professor-records.server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/portal/professor-records.server")
    >();

  return {
    ...actual,
    findProfessorDocumentConflict: findProfessorDocumentConflictMock,
  };
});

installDatabaseTestHooks();

beforeEach(async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/portal/professor-records.server")
  >("@/lib/portal/professor-records.server");

  findProfessorDocumentConflictMock.mockReset();
  findProfessorDocumentConflictMock.mockImplementation(
    actual.findProfessorDocumentConflict,
  );
});

describe("handleCreateProfessorAction", () => {
  test("creates the professor with the normalized document pair", async () => {
    const owner = await createOwner("profesores.create.document@example.com");

    const result = await handleCreateProfessorAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: " ana ",
        lastName: " de la cruz ",
        documentType: "dni",
        documentNumber: "12.345-678",
      }),
    });

    expect(result).toMatchObject({ status: "success" });
    expect(await findAcademyProfessors(owner.academyId)).toEqual([
      expect.objectContaining({
        firstName: "Ana",
        lastName: "de la Cruz",
        documentType: "dni",
        documentNumber: "12345678",
      }),
    ]);
  });

  test("creates the professor without a document", async () => {
    const owner = await createOwner("profesores.create.nodocument@example.com");

    const result = await handleCreateProfessorAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        documentType: "",
        documentNumber: "",
      }),
    });

    expect(result).toMatchObject({ status: "success" });
    expect(await findAcademyProfessors(owner.academyId)).toEqual([
      expect.objectContaining({ documentType: null, documentNumber: null }),
    ]);
  });

  test("refuses a half document pair", async () => {
    const owner = await createOwner("profesores.create.halfpair@example.com");

    const result = await handleCreateProfessorAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        documentType: "",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: { documentType: "Seleccioná el tipo de documento." },
      modalOpen: true,
    });
    expect(await findAcademyProfessors(owner.academyId)).toHaveLength(0);
  });

  test("refuses a number another professor of the academy holds under another type", async () => {
    const owner = await createOwner("profesores.create.duplicate@example.com");
    const [existing] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
        documentType: "other",
        documentNumber: "12345678",
      })
      .returning();

    const result = await handleCreateProfessorAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        documentType: "dni",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un Profesor con ese documento en tu academia.",
      },
      duplicateDocumentProfessorId: existing.id,
    });
    expect(await findAcademyProfessors(owner.academyId)).toHaveLength(1);
  });

  test("names an archived match", async () => {
    const owner = await createOwner("profesores.create.archived@example.com");
    const [archived] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
        documentType: "dni",
        documentNumber: "12345678",
        active: false,
      })
      .returning();

    const result = await handleCreateProfessorAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        documentType: "dni",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un Profesor archivado con ese documento en tu academia.",
      },
      duplicateDocumentProfessorId: archived.id,
    });
  });

  test("allows the number a dancer of the same academy holds", async () => {
    const owner = await createOwner("profesores.create.dancer@example.com");
    await db.insert(dancers).values({
      academyId: owner.academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2015-05-04",
      documentType: "dni",
      documentNumber: "12345678",
    });

    const result = await handleCreateProfessorAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        documentType: "dni",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({ status: "success" });
  });

  test("maps the unique violation to the field error when the pre-check misses it", async () => {
    const owner = await createOwner("profesores.create.race@example.com");
    const [existing] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
        documentType: "dni",
        documentNumber: "12345678",
      })
      .returning();

    // The other save lands between the pre-check and the insert. A different
    // name, so the document twin is what refuses and not the name warning.
    findProfessorDocumentConflictMock.mockResolvedValueOnce(null);

    const result = await handleCreateProfessorAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Luz",
        lastName: "Diaz",
        documentType: "other",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un Profesor con ese documento en tu academia.",
      },
      duplicateDocumentProfessorId: existing.id,
    });
    expect(await findAcademyProfessors(owner.academyId)).toHaveLength(1);
  });

  test("warns when the academy already has a professor with that name", async () => {
    const owner = await createOwner("profesores.create.samename@example.com");
    const [existing] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
      })
      .returning();

    const result = await handleCreateProfessorAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: " ana ",
        lastName: "paz",
        documentType: "",
        documentNumber: "",
      }),
    });

    expect(result).toMatchObject({
      status: "warning",
      warning: {
        kind: "professor-name",
        matches: [{ id: existing.id, label: "Ana Paz" }],
        scope: "portal",
      },
      modalOpen: true,
    });
    expect(await findAcademyProfessors(owner.academyId)).toHaveLength(1);
  });

  test("creates the professor once the match is acknowledged", async () => {
    const owner = await createOwner(
      "profesores.create.acknowledged@example.com",
    );
    const [existing] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
      })
      .returning();
    const formData = createFormData({
      firstName: "Ana",
      lastName: "Paz",
      documentType: "",
      documentNumber: "",
    });
    formData.append(acknowledgedDuplicateIdsField, existing.id);

    const result = await handleCreateProfessorAction({
      academyId: owner.academyId,
      formData,
    });

    expect(result).toMatchObject({ status: "success" });
    expect(await findAcademyProfessors(owner.academyId)).toHaveLength(2);
  });

  test("returns the document refusal rather than the name warning", async () => {
    const owner = await createOwner(
      "profesores.create.documentwins@example.com",
    );
    await db.insert(professors).values({
      academyId: owner.academyId,
      firstName: "Ana",
      lastName: "Paz",
      documentType: "dni",
      documentNumber: "12345678",
    });

    const result = await handleCreateProfessorAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        documentType: "other",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un Profesor con ese documento en tu academia.",
      },
    });
  });
});

async function createOwner(email: string, academyName = "Academia Dueña") {
  return await createAcademySession({ academyName, email });
}

async function findAcademyProfessors(academyId: string) {
  return await db
    .select()
    .from(professors)
    .where(eq(professors.academyId, academyId));
}

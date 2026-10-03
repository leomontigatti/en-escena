import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import { handleCreateDancerAction } from "@/features/portal/dancers/create/server";
import { createAcademySession } from "@/features/portal/test-support/db";
import { acknowledgedDuplicateIdsField } from "@/lib/shared/duplicate-warning";
import { checkAssetAgainstPolicy } from "@/lib/storage/asset-kinds";
import { createFormData } from "@/lib/test-support/form-data";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

const {
  findDancerDocumentConflictMock,
  removeDocumentImagesMock,
  uploadDocumentImageMock,
} = vi.hoisted(() => ({
  findDancerDocumentConflictMock: vi.fn(),
  removeDocumentImagesMock: vi.fn(),
  uploadDocumentImageMock: vi.fn(),
}));

// Only the factory is replaced: the key layout stays real.
vi.mock("@/lib/storage/dancer-documents.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/storage/dancer-documents.server")
  >()),
  createDefaultDancerDocumentStorage: () => ({
    createDocumentImageSignedUrl: vi.fn(),
    removeDocumentImages: removeDocumentImagesMock,
    uploadDocumentImage: uploadDocumentImageMock,
  }),
}));

vi.mock("@/lib/dancers/dancer-records.server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/dancers/dancer-records.server")
    >();

  return {
    ...actual,
    findDancerDocumentConflict: findDancerDocumentConflictMock,
  };
});

installDatabaseTestHooks();

beforeEach(async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/dancers/dancer-records.server")
  >("@/lib/dancers/dancer-records.server");

  findDancerDocumentConflictMock.mockReset();
  findDancerDocumentConflictMock.mockImplementation(
    actual.findDancerDocumentConflict,
  );
  removeDocumentImagesMock.mockReset();
  uploadDocumentImageMock.mockReset();
  uploadDocumentImageMock.mockImplementation(
    async ({
      academyId,
      dancerId,
      file,
      side,
    }: {
      academyId: string;
      dancerId: string;
      file: File;
      side: "back" | "front";
    }) => {
      // Delegated to the real policy so this fake cannot accept what the store
      // would reject.
      const rejection = checkAssetAgainstPolicy("dancerDocumentImage", file);

      if (rejection) {
        return { ok: false, rejection };
      }

      return {
        ok: true,
        storageKey: `academies/${academyId}/dancers/${dancerId}/document-${side}.jpg`,
      };
    },
  );
});

describe("handleCreateDancerAction", () => {
  test("creates the dancer with the normalized document pair", async () => {
    const owner = await createOwner("bailarines.create.document@example.com");

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: " ana ",
        lastName: " paz ",
        birthDate: "2015-05-04",
        documentType: "dni",
        documentNumber: "12.345-678",
      }),
    });

    expect(result).toMatchObject({ status: "created" });
    expect(await findAcademyDancers(owner.academyId)).toEqual([
      expect.objectContaining({
        firstName: "Ana",
        lastName: "Paz",
        documentType: "dni",
        documentNumber: "12345678",
      }),
    ]);
  });

  test("creates the dancer without a document", async () => {
    const owner = await createOwner("bailarines.create.nodocument@example.com");

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
        documentType: "",
        documentNumber: "",
      }),
    });

    expect(result).toMatchObject({ status: "created" });
    expect(await findAcademyDancers(owner.academyId)).toEqual([
      expect.objectContaining({
        documentType: null,
        documentNumber: null,
      }),
    ]);
  });

  test("refuses a half document pair", async () => {
    const owner = await createOwner("bailarines.create.halfpair@example.com");

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
        documentType: "",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: { documentType: "Seleccioná el tipo de documento." },
    });
    expect(await findAcademyDancers(owner.academyId)).toHaveLength(0);
  });

  test("refuses a number another dancer of the academy holds under another type", async () => {
    const owner = await createOwner("bailarines.create.duplicate@example.com");
    const [existing] = await db
      .insert(dancers)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
        documentType: "other",
        documentNumber: "12345678",
      })
      .returning();

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2016-05-04",
        documentType: "dni",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un bailarín con ese documento en tu academia.",
      },
      duplicateDocumentDancerId: existing.id,
    });
    expect(await findAcademyDancers(owner.academyId)).toHaveLength(1);
  });

  test("names an archived match", async () => {
    const owner = await createOwner("bailarines.create.archived@example.com");
    const [archived] = await db
      .insert(dancers)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
        documentType: "dni",
        documentNumber: "12345678",
        active: false,
      })
      .returning();

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2016-05-04",
        documentType: "dni",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un bailarín archivado con ese documento en tu academia.",
      },
      duplicateDocumentDancerId: archived.id,
    });
  });

  test("warns when the academy already has that name and birth date", async () => {
    const owner = await createOwner("bailarines.create.samename@example.com");
    const [existing] = await db
      .insert(dancers)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
      })
      .returning();

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: " ana ",
        lastName: "paz",
        birthDate: "2015-05-04",
        documentType: "",
        documentNumber: "",
      }),
    });

    expect(result).toMatchObject({
      status: "warning",
      warning: {
        kind: "dancer-name",
        matches: [{ id: existing.id, label: "Ana Paz" }],
        scope: "portal",
      },
    });
    expect(await findAcademyDancers(owner.academyId)).toHaveLength(1);
  });

  test("warns when the matching name contains an s", async () => {
    const owner = await createOwner("bailarines.create.sname@example.com");
    const [existing] = await db
      .insert(dancers)
      .values({
        academyId: owner.academyId,
        firstName: "Rosa",
        lastName: "Bustos",
        birthDate: "2015-05-04",
      })
      .returning();

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "rosa",
        lastName: "bustos",
        birthDate: "2015-05-04",
        documentType: "",
        documentNumber: "",
      }),
    });

    expect(result).toMatchObject({
      status: "warning",
      warning: { matches: [{ id: existing.id, label: "Rosa Bustos" }] },
    });
  });

  test("does not warn when the birth date differs", async () => {
    const owner = await createOwner("bailarines.create.otherbirth@example.com");
    await db.insert(dancers).values({
      academyId: owner.academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2015-05-04",
    });

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2016-05-04",
        documentType: "",
        documentNumber: "",
      }),
    });

    expect(result).toMatchObject({ status: "created" });
  });

  test("creates the dancer once the match is acknowledged", async () => {
    const owner = await createOwner(
      "bailarines.create.acknowledged@example.com",
    );
    const [existing] = await db
      .insert(dancers)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
      })
      .returning();
    const formData = createFormData({
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2015-05-04",
      documentType: "",
      documentNumber: "",
    });
    formData.append(acknowledgedDuplicateIdsField, existing.id);

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData,
    });

    expect(result).toMatchObject({ status: "created" });
    expect(await findAcademyDancers(owner.academyId)).toHaveLength(2);
  });

  test("warns again for a match the acknowledged ids do not cover", async () => {
    const owner = await createOwner("bailarines.create.newmatch@example.com");
    const [first] = await db
      .insert(dancers)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
      })
      .returning();
    const [second] = await db
      .insert(dancers)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
      })
      .returning();
    const formData = createFormData({
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2015-05-04",
      documentType: "",
      documentNumber: "",
    });
    formData.append(acknowledgedDuplicateIdsField, first.id);

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData,
    });

    // Every match the user will have seen, the acknowledged one included, so
    // the next submit covers the whole set instead of alternating between them.
    expect(result.status).toBe("warning");
    const matchIds =
      result.status === "warning"
        ? result.warning.matches.map((match) => match.id)
        : [];
    expect([...matchIds].sort()).toEqual([first.id, second.id].sort());

    for (const matchId of matchIds) {
      formData.append(acknowledgedDuplicateIdsField, matchId);
    }

    expect(
      await submitCreateDancer({ academyId: owner.academyId, formData }),
    ).toMatchObject({ status: "created" });
  });

  test("returns the document refusal rather than the name warning", async () => {
    const owner = await createOwner(
      "bailarines.create.documentwins@example.com",
    );
    await db.insert(dancers).values({
      academyId: owner.academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2015-05-04",
      documentType: "dni",
      documentNumber: "12345678",
    });

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
        documentType: "other",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un bailarín con ese documento en tu academia.",
      },
    });
  });

  test("allows the same number in another academy", async () => {
    const owner = await createOwner(
      "bailarines.create.otheracademy@example.com",
    );
    const other = await createOwner(
      "bailarines.create.otheracademy.two@example.com",
      "Otra Academia",
    );
    await db.insert(dancers).values({
      academyId: other.academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2015-05-04",
      documentType: "dni",
      documentNumber: "12345678",
    });

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
        documentType: "dni",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({ status: "created" });
    expect(await findAcademyDancers(owner.academyId)).toHaveLength(1);
  });

  test("maps the unique violation to the field error when the pre-check misses it", async () => {
    const owner = await createOwner("bailarines.create.race@example.com");
    const [existing] = await db
      .insert(dancers)
      .values({
        academyId: owner.academyId,
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
        documentType: "dni",
        documentNumber: "12345678",
      })
      .returning();

    // The other save lands between the pre-check and the insert.
    findDancerDocumentConflictMock.mockResolvedValueOnce(null);

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2016-05-04",
        documentType: "other",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un bailarín con ese documento en tu academia.",
      },
      duplicateDocumentDancerId: existing.id,
    });
    expect(await findAcademyDancers(owner.academyId)).toHaveLength(1);
  });
});

describe("handleCreateDancerAction with document images", () => {
  test("stores both images under the new dancer and links them to it", async () => {
    const owner = await createOwner("bailarines.create.images@example.com");
    const formData = dancerFormData();
    formData.set("documentFrontImage", imageFile("frente.jpg"));
    formData.set("documentBackImage", imageFile("dorso.jpg"));

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData,
    });

    expect(result).toMatchObject({ status: "created" });
    const [dancer] = await findAcademyDancers(owner.academyId);
    expect(dancer).toMatchObject({
      documentFrontImageStorageKey: `academies/${owner.academyId}/dancers/${dancer.id}/document-front.jpg`,
      documentBackImageStorageKey: `academies/${owner.academyId}/dancers/${dancer.id}/document-back.jpg`,
    });
    expect(removeDocumentImagesMock).not.toHaveBeenCalled();
  });

  test("never links a stored key the form sends without a file", async () => {
    const owner = await createOwner("bailarines.create.forgedkey@example.com");
    const formData = dancerFormData();
    formData.set(
      "documentFrontImageStorageKey",
      "academies/otra/dancers/x.jpg",
    );

    await submitCreateDancer({ academyId: owner.academyId, formData });

    expect(await findAcademyDancers(owner.academyId)).toEqual([
      expect.objectContaining({
        documentFrontImageStorageKey: null,
        documentBackImageStorageKey: null,
      }),
    ]);
  });

  test("leaves no dancer and no file behind when an upload fails", async () => {
    const owner = await createOwner(
      "bailarines.create.uploadfails@example.com",
    );
    const formData = dancerFormData();
    formData.set("documentFrontImage", imageFile("frente.jpg"));
    formData.set("documentBackImage", imageFile("dorso.jpg"));
    const uploadOnce = uploadDocumentImageMock.getMockImplementation();
    uploadDocumentImageMock.mockImplementation(async (input) => {
      if (input.side === "back") {
        throw new Error("volume unavailable");
      }

      return await uploadOnce?.(input);
    });

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData,
    });

    expect(result).toMatchObject({
      status: "error",
      message: "No pudimos subir el archivo del dorso. Intentá nuevamente.",
    });
    expect(await findAcademyDancers(owner.academyId)).toHaveLength(0);
    expect(removeDocumentImagesMock).toHaveBeenCalledWith([
      expect.stringMatching(/document-front\.jpg$/),
    ]);
  });

  test("removes the stored images when the insert refuses the document", async () => {
    const owner = await createOwner("bailarines.create.raceimages@example.com");
    await db.insert(dancers).values({
      academyId: owner.academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2015-05-04",
      documentType: "dni",
      documentNumber: "12345678",
    });
    // The other save lands between the pre-check and the insert.
    findDancerDocumentConflictMock.mockResolvedValueOnce(null);
    const formData = dancerFormData({
      birthDate: "2016-05-04",
      documentType: "dni",
      documentNumber: "12345678",
    });
    formData.set("documentFrontImage", imageFile("frente.jpg"));

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData,
    });

    expect(result).toMatchObject({ status: "error" });
    expect(await findAcademyDancers(owner.academyId)).toHaveLength(1);
    expect(removeDocumentImagesMock).toHaveBeenCalledWith([
      expect.stringMatching(/document-front\.jpg$/),
    ]);
  });

  test("uploads nothing while the form still has to be corrected", async () => {
    const owner = await createOwner("bailarines.create.noupload@example.com");
    const formData = dancerFormData({ firstName: "" });
    formData.set("documentFrontImage", imageFile("frente.jpg"));

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData,
    });

    expect(result).toMatchObject({ status: "error" });
    expect(uploadDocumentImageMock).not.toHaveBeenCalled();
  });

  test("refuses the save when the browser already refused a picked file", async () => {
    const owner = await createOwner(
      "bailarines.create.clientimage@example.com",
    );
    const formData = dancerFormData();
    formData.set(
      "documentFrontImageValidationError",
      "El archivo debe ser JPG, PNG o WEBP.",
    );

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData,
    });

    expect(result).toMatchObject({
      status: "error",
      message: "El archivo debe ser JPG, PNG o WEBP.",
    });
    expect(await findAcademyDancers(owner.academyId)).toHaveLength(0);
  });
});

describe("handleCreateDancerAction redirect", () => {
  test("goes back to the list with the created toast in the flash session", async () => {
    const owner = await createOwner("bailarines.create.redirect@example.com");

    const result = await submitCreateDancer({
      academyId: owner.academyId,
      formData: dancerFormData(),
    });

    expect(result).toMatchObject({
      status: "created",
      location: "/portal/bailarines",
    });
    expect(result.status === "created" && result.setCookie).toBeTruthy();
  });
});

/**
 * The action's answer, with the redirect a successful save throws read as a
 * value so every test can assert on one shape.
 */
async function submitCreateDancer(
  input: Parameters<typeof handleCreateDancerAction>[0],
) {
  try {
    return await handleCreateDancerAction(input);
  } catch (thrown) {
    if (thrown instanceof Response && thrown.status === 302) {
      return {
        status: "created" as const,
        location: thrown.headers.get("Location"),
        setCookie: thrown.headers.get("Set-Cookie"),
      };
    }

    throw thrown;
  }
}

function dancerFormData(overrides: Record<string, string> = {}) {
  return createFormData({
    firstName: "Ana",
    lastName: "Paz",
    birthDate: "2015-05-04",
    documentType: "",
    documentNumber: "",
    ...overrides,
  });
}

function imageFile(name: string) {
  return new File(["image"], name, { type: "image/jpeg" });
}

async function createOwner(email: string, academyName = "Academia Dueña") {
  return await createAcademySession({ academyName, email });
}

async function findAcademyDancers(academyId: string) {
  return await db
    .select()
    .from(dancers)
    .where(eq(dancers.academyId, academyId));
}

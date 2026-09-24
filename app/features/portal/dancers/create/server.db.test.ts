import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import { handleCreateDancerAction } from "@/features/portal/dancers/create/server";
import { createAcademySession } from "@/features/portal/test-support/db";
import { createFormData } from "@/lib/test-support/form-data";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

const { findDancerDocumentConflictMock } = vi.hoisted(() => ({
  findDancerDocumentConflictMock: vi.fn(),
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
});

describe("handleCreateDancerAction", () => {
  test("creates the dancer with the normalized document pair", async () => {
    const owner = await createOwner("bailarines.create.document@example.com");

    const result = await handleCreateDancerAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: " ana ",
        lastName: " paz ",
        birthDate: "2015-05-04",
        documentType: "dni",
        documentNumber: "12.345-678",
      }),
    });

    expect(result).toMatchObject({ status: "success" });
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

    const result = await handleCreateDancerAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
        documentType: "",
        documentNumber: "",
      }),
    });

    expect(result).toMatchObject({ status: "success" });
    expect(await findAcademyDancers(owner.academyId)).toEqual([
      expect.objectContaining({
        documentType: null,
        documentNumber: null,
      }),
    ]);
  });

  test("refuses a half document pair", async () => {
    const owner = await createOwner("bailarines.create.halfpair@example.com");

    const result = await handleCreateDancerAction({
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
      modalOpen: true,
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

    const result = await handleCreateDancerAction({
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
          "Ya existe un Bailarín con ese documento en tu academia.",
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

    const result = await handleCreateDancerAction({
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
          "Ya existe un Bailarín archivado con ese documento en tu academia.",
      },
      duplicateDocumentDancerId: archived.id,
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

    const result = await handleCreateDancerAction({
      academyId: owner.academyId,
      formData: createFormData({
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2015-05-04",
        documentType: "dni",
        documentNumber: "12345678",
      }),
    });

    expect(result).toMatchObject({ status: "success" });
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

    const result = await handleCreateDancerAction({
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
          "Ya existe un Bailarín con ese documento en tu academia.",
      },
      duplicateDocumentDancerId: existing.id,
    });
    expect(await findAcademyDancers(owner.academyId)).toHaveLength(1);
  });
});

async function createOwner(email: string, academyName = "Academia Dueña") {
  return await createAcademySession({ academyName, email });
}

async function findAcademyDancers(academyId: string) {
  return await db
    .select()
    .from(dancers)
    .where(eq(dancers.academyId, academyId));
}

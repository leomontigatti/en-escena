import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { choreographies, choreographyDancers, dancers } from "@/db/schema";
import { createCategory } from "@/lib/categories/repository.server";
import { createModality } from "@/lib/modalities/repository.server";
import { fixedExperienceLevel } from "@/lib/events/bases-test-fixtures.server.db";
import { createEvent } from "@/lib/events/management.server";
import { handlePortalDancerDetailAction } from "@/features/portal/dancers/detail/server";
import { loadPortalDancerDetail } from "@/features/portal/dancers/detail/server";
import { loadPortalDancersList } from "@/features/portal/dancers/list/server";
import {
  createAcademySession,
  createPortalPostRequest,
  expectThrownResponse,
} from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

const createDocumentImageSignedUrlMock = vi.hoisted(() => vi.fn());
const uploadDocumentImageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/storage/dancer-documents.server", () => ({
  createDefaultDancerDocumentStorage: () => ({
    createDocumentImageSignedUrl: createDocumentImageSignedUrlMock,
    uploadDocumentImage: uploadDocumentImageMock,
  }),
}));

installDatabaseTestHooks();

beforeEach(() => {
  createDocumentImageSignedUrlMock.mockReset();
  uploadDocumentImageMock.mockReset();
  createDocumentImageSignedUrlMock.mockImplementation(
    async (storageKey: string) => `signed:${storageKey}`,
  );
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
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Document image must be a JPEG, PNG, or WebP file.");
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Document image must be 10 MB or smaller.");
      }

      const extension = file.type === "image/png" ? "png" : "jpg";

      return `academies/${academyId}/dancers/${dancerId}/document-${side}.${extension}`;
    },
  );
});

describe.sequential("handlePortalDancerDetailAction", () => {
  test("updates a dancer in place and normalizes DNI documents", async () => {
    const session = await createAcademySession({
      email: "bailarines.edit@example.com",
      academyName: "Academia Edición",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
      })
      .returning();

    const response = await expectThrownResponse(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancer.id}`,
          session.cookie,
          dancerEditFormData({
            firstName: "  ana maría ",
            lastName: " de la CRUZ ",
            birthDate: "2014-05-06",
            documentType: "dni",
            documentNumber: "12.345 678-9",
          }),
        ),
        params: { dancerId: dancer.id },
      }),
      302,
    );

    expect(response.headers.get("location")).toBe(
      `/portal/bailarines/${dancer.id}?notificacion=bailarin-guardado`,
    );
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({
      firstName: "Ana María",
      lastName: "De la Cruz",
      birthDate: "2014-05-06",
      documentType: "dni",
      documentNumber: "123456789",
    });
  });

  test("recalculates linked choreographies when a dancer birth date changes", async () => {
    const session = await createAcademySession({
      email: "bailarines.birthdate.recalculation@example.com",
      academyName: "Academia Recálculo",
    });
    const event = await createSavedEvent({
      name: "Regional Recálculo",
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
    });
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const level = fixedExperienceLevel(event.id);
    const youngerCategory = await expectCreated(
      createCategory(event.id, {
        name: "Menor",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [modality.id],
        experienceLevels: [level.id],
      }),
    );
    const olderCategory = await expectCreated(
      createCategory(event.id, {
        name: "Mayor",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["solo"],
        modalityIds: [modality.id],
        experienceLevels: [],
      }),
    );
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Recálculo",
        birthDate: "2014-05-01",
      })
      .returning();
    const [choreography] = await db
      .insert(choreographies)
      .values({
        academyId: session.academyId,
        eventId: event.id,
        name: "Solo con recálculo",
        groupType: "solo",
        modalityId: modality.id,
        categoryId: youngerCategory.id,
        categoryCalculationMode: "oldest",
        categoryAgeBasis: 12,
        experienceLevelId: level.id,
      })
      .returning();
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 12,
    });

    await expectThrownResponse(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancer.id}`,
          session.cookie,
          dancerEditFormData({
            firstName: "Ana",
            lastName: "Recálculo",
            birthDate: "2011-05-01",
            documentType: "",
            documentNumber: "",
          }),
        ),
        params: { dancerId: dancer.id },
      }),
      302,
    );

    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      categoryId: olderCategory.id,
      categoryAgeBasis: 15,
      categoryCalculationMode: "oldest",
      experienceLevelId: null,
    });
    await expect(
      db.query.choreographyDancers.findFirst({
        where: and(
          eq(choreographyDancers.choreographyId, choreography.id),
          eq(choreographyDancers.dancerId, dancer.id),
        ),
      }),
    ).resolves.toMatchObject({
      ageAtEventStart: 15,
    });
  });

  test("uploads dancer document images and stores their canonical keys", async () => {
    const session = await createAcademySession({
      email: "bailarines.imagenes@example.com",
      academyName: "Academia Imagenes",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Luz",
        lastName: "Mar",
        birthDate: "2012-03-04",
      })
      .returning();
    const formData = dancerEditFormData({
      firstName: "Luz",
      lastName: "Mar",
      birthDate: "2012-03-04",
      documentType: "dni",
      documentNumber: "12.345.678",
    });
    formData.set(
      "documentFrontImage",
      new File(["front"], "frente.png", { type: "image/png" }),
    );
    formData.set(
      "documentBackImage",
      new File(["back"], "dorso.jpg", { type: "image/jpeg" }),
    );

    await expectThrownResponse(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancer.id}`,
          session.cookie,
          formData,
        ),
        params: { dancerId: dancer.id },
      }),
      302,
    );

    expect(uploadDocumentImageMock).toHaveBeenCalledWith({
      academyId: session.academyId,
      dancerId: dancer.id,
      file: formData.get("documentFrontImage"),
      side: "front",
    });
    expect(uploadDocumentImageMock).toHaveBeenCalledWith({
      academyId: session.academyId,
      dancerId: dancer.id,
      file: formData.get("documentBackImage"),
      side: "back",
    });
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({
      documentFrontImageStorageKey: `academies/${session.academyId}/dancers/${dancer.id}/document-front.png`,
      documentBackImageStorageKey: `academies/${session.academyId}/dancers/${dancer.id}/document-back.jpg`,
    });
  });

  test("rejects invalid dancer document images without saving", async () => {
    const session = await createAcademySession({
      email: "bailarines.imagenes-invalidas@example.com",
      academyName: "Academia Imagenes Invalidas",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Sol",
        lastName: "Río",
        birthDate: "2012-03-04",
      })
      .returning();
    const formData = dancerEditFormData({
      firstName: "Sol",
      lastName: "Río",
      birthDate: "2012-03-04",
      documentType: "dni",
      documentNumber: "12.345.678",
    });
    formData.set(
      "documentFrontImage",
      new File(["html"], "confirmar-email.html", { type: "text/html" }),
    );

    await expect(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancer.id}`,
          session.cookie,
          formData,
        ),
        params: { dancerId: dancer.id },
      }),
    ).resolves.toMatchObject({
      status: "error",
      message: "El archivo del frente debe ser JPG, PNG o WEBP.",
    });
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({
      documentFrontImageStorageKey: null,
      documentBackImageStorageKey: null,
      documentType: null,
      documentNumber: null,
    });

    const oversizedFormData = dancerEditFormData({
      firstName: "Sol",
      lastName: "Río",
      birthDate: "2012-03-04",
      documentType: "dni",
      documentNumber: "12.345.678",
    });
    oversizedFormData.set(
      "documentFrontImage",
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "frente.png", {
        type: "image/png",
      }),
    );

    await expect(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancer.id}`,
          session.cookie,
          oversizedFormData,
        ),
        params: { dancerId: dancer.id },
      }),
    ).resolves.toMatchObject({
      status: "error",
      message: "El archivo del frente no puede superar 10 MB.",
    });
  });

  test("keeps client-side document image validation errors from saving", async () => {
    const session = await createAcademySession({
      email: "bailarines.imagenes-cliente@example.com",
      academyName: "Academia Validacion Cliente",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Uma",
        lastName: "Sol",
        birthDate: "2012-03-04",
      })
      .returning();
    const formData = dancerEditFormData({
      firstName: "Uma",
      lastName: "Sol",
      birthDate: "2012-03-04",
      documentType: "dni",
      documentNumber: "12.345.678",
    });
    formData.set(
      "documentFrontImageValidationError",
      "El archivo debe ser JPG, PNG o WEBP.",
    );

    await expect(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancer.id}`,
          session.cookie,
          formData,
        ),
        params: { dancerId: dancer.id },
      }),
    ).resolves.toMatchObject({
      status: "error",
      message: "El archivo debe ser JPG, PNG o WEBP.",
    });
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({
      documentType: null,
      documentNumber: null,
    });
  });

  test("loads signed document image URLs for existing dancer storage keys", async () => {
    const session = await createAcademySession({
      email: "bailarines.signed-urls@example.com",
      academyName: "Academia Signed URLs",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Lara",
        lastName: "Imagenes",
        birthDate: "2012-04-01",
        documentType: "dni",
        documentNumber: "12345678",
        documentFrontImageStorageKey: "dancers/lara-front.jpg",
        documentBackImageStorageKey: "dancers/lara-back.jpg",
      })
      .returning();

    await expect(
      loadPortalDancerDetail({
        request: new Request(
          `http://localhost/portal/bailarines/${dancer.id}`,
          {
            headers: { cookie: session.cookie },
          },
        ),
        params: { dancerId: dancer.id },
      }),
    ).resolves.toMatchObject({
      documentImageUrls: {
        front: "signed:dancers/lara-front.jpg",
        back: "signed:dancers/lara-back.jpg",
      },
    });
    expect(createDocumentImageSignedUrlMock).toHaveBeenCalledWith(
      "dancers/lara-front.jpg",
    );
    expect(createDocumentImageSignedUrlMock).toHaveBeenCalledWith(
      "dancers/lara-back.jpg",
    );
  });

  test("loads the verification states and blocks academy edits after verification", async () => {
    const session = await createAcademySession({
      email: "bailarines.verification@example.com",
      academyName: "Academia Verificación",
    });
    const [
      incompleteDancer,
      incompleteWithDocumentDancer,
      incompleteWithDocumentNumberDancer,
      unverifiedDancer,
      verifiedDancer,
    ] = await db
      .insert(dancers)
      .values([
        {
          academyId: session.academyId,
          firstName: "Lola",
          lastName: "Incompleta",
          birthDate: "2014-02-01",
        },
        {
          academyId: session.academyId,
          firstName: "Mia",
          lastName: "Documento",
          birthDate: "2012-02-01",
          documentType: "dni",
        },
        {
          academyId: session.academyId,
          firstName: "Mica",
          lastName: "Sin Imagenes",
          birthDate: "2013-03-02",
          documentType: "dni",
          documentNumber: "11111111",
        },
        {
          academyId: session.academyId,
          firstName: "Nora",
          lastName: "Pendiente",
          birthDate: "2012-04-03",
          documentType: "dni",
          documentNumber: "22222222",
          documentFrontImageStorageKey: "dancers/nora-front.jpg",
          documentBackImageStorageKey: "dancers/nora-back.jpg",
        },
        {
          academyId: session.academyId,
          firstName: "Vera",
          lastName: "Verificada",
          birthDate: "2011-05-04",
          documentType: "dni",
          documentNumber: "33333333",
          documentFrontImageStorageKey: "dancers/vera-front.jpg",
          documentBackImageStorageKey: "dancers/vera-back.jpg",
          identityVerifiedAt: new Date("2026-06-16T12:00:00Z"),
        },
      ])
      .returning();

    const loaderData = await loadPortalDancersList(
      new Request("http://localhost/portal/bailarines", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(loaderData.dancers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: incompleteDancer.id,
          verificationStatus: "incomplete",
        }),
        expect.objectContaining({
          id: incompleteWithDocumentDancer.id,
          verificationStatus: "incomplete",
        }),
        expect.objectContaining({
          id: unverifiedDancer.id,
          verificationStatus: "unverified",
        }),
        expect.objectContaining({
          id: incompleteWithDocumentNumberDancer.id,
          verificationStatus: "incomplete",
        }),
        expect.objectContaining({
          id: verifiedDancer.id,
          verificationStatus: "verified",
        }),
      ]),
    );

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${verifiedDancer.id}`,
        session.cookie,
        dancerEditFormData({
          firstName: "Vera",
          lastName: "Verificada",
          birthDate: "2011-05-04",
          documentType: "dni",
          documentNumber: "33333333",
          documentFrontImageStorageKey: "dancers/vera-front-v2.jpg",
          documentBackImageStorageKey: "dancers/vera-back.jpg",
        }),
      ),
      params: { dancerId: verifiedDancer.id },
    });

    expect(result).toMatchObject({
      status: "error",
      message:
        "La identidad verificada solo puede corregirse desde administración.",
    });
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, verifiedDancer.id),
      }),
    ).resolves.toMatchObject({
      documentFrontImageStorageKey: "dancers/vera-front.jpg",
      identityVerifiedAt: new Date("2026-06-16T12:00:00Z"),
    });
  });

  test("keeps existing document images when clearing document type and number", async () => {
    const session = await createAcademySession({
      email: "bailarines.clear-document@example.com",
      academyName: "Academia Limpia Documento",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Mora",
        lastName: "Documento",
        birthDate: "2012-04-01",
        documentType: "dni",
        documentNumber: "12345678",
        documentFrontImageStorageKey: "dancers/mora-front.jpg",
        documentBackImageStorageKey: "dancers/mora-back.jpg",
      })
      .returning();

    await expectThrownResponse(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancer.id}`,
          session.cookie,
          dancerEditFormData({
            firstName: "Mora",
            lastName: "Documento",
            birthDate: "2012-04-01",
            documentType: "",
            documentNumber: "",
            documentFrontImageStorageKey: "dancers/mora-front.jpg",
            documentBackImageStorageKey: "dancers/mora-back.jpg",
          }),
        ),
        params: { dancerId: dancer.id },
      }),
      302,
    );

    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({
      documentType: null,
      documentNumber: null,
      documentFrontImageStorageKey: "dancers/mora-front.jpg",
      documentBackImageStorageKey: "dancers/mora-back.jpg",
    });
  });

  test("keeps submitted values and field errors when the document pair is partial", async () => {
    const session = await createAcademySession({
      email: "bailarines.partial@example.com",
      academyName: "Academia Parcial",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
      })
      .returning();

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        dancerEditFormData({
          firstName: "Ana",
          lastName: "Alvarez",
          birthDate: "2014-02-01",
          documentType: "",
          documentNumber: "ABC 123",
        }),
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({
      status: "error",
      message: "Revisá los datos del Bailarín.",
      fieldErrors: {
        documentType: "Seleccioná el tipo de documento.",
      },
      values: {
        documentType: "",
        documentNumber: "ABC 123",
      },
    });
  });

  test("rejects duplicate complete documents only within the same Academia", async () => {
    const ownerSession = await createAcademySession({
      email: "bailarines.duplicate.owner@example.com",
      academyName: "Academia Dueña",
    });
    const otherSession = await createAcademySession({
      email: "bailarines.duplicate.other@example.com",
      academyName: "Academia Ajena",
    });
    const [ownerExisting] = await db
      .insert(dancers)
      .values({
        academyId: ownerSession.academyId,
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
        documentType: "passport",
        documentNumber: "AB 123",
      })
      .returning();
    const [ownerEditable] = await db
      .insert(dancers)
      .values({
        academyId: ownerSession.academyId,
        firstName: "Beatriz",
        lastName: "Suarez",
        birthDate: "2013-03-02",
      })
      .returning();
    const [otherEditable] = await db
      .insert(dancers)
      .values({
        academyId: otherSession.academyId,
        firstName: "Clara",
        lastName: "Paz",
        birthDate: "2012-04-01",
      })
      .returning();

    const duplicateResult = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${ownerEditable.id}`,
        ownerSession.cookie,
        dancerEditFormData({
          firstName: "Beatriz",
          lastName: "Suarez",
          birthDate: "2013-03-02",
          documentType: "passport",
          documentNumber: "  AB   123 ",
        }),
      ),
      params: { dancerId: ownerEditable.id },
    });

    expect(duplicateResult).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un Bailarín con ese documento en tu academia.",
      },
    });
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, ownerEditable.id),
      }),
    ).resolves.toMatchObject({
      documentType: null,
      documentNumber: null,
    });

    const crossAcademyResponse = await expectThrownResponse(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${otherEditable.id}`,
          otherSession.cookie,
          dancerEditFormData({
            firstName: "Clara",
            lastName: "Paz",
            birthDate: "2012-04-01",
            documentType: "passport",
            documentNumber: "AB 123",
          }),
        ),
        params: { dancerId: otherEditable.id },
      }),
      302,
    );

    expect(crossAcademyResponse.headers.get("location")).toBe(
      `/portal/bailarines/${otherEditable.id}?notificacion=bailarin-guardado`,
    );
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, otherEditable.id),
      }),
    ).resolves.toMatchObject({
      documentType: "passport",
      documentNumber: "AB 123",
    });
    expect(ownerExisting.id).not.toBe(otherEditable.id);
  });

  test("returns not found when another Academia loads or updates a Bailarín", async () => {
    const ownerSession = await createAcademySession({
      email: "bailarines.owner.scope@example.com",
      academyName: "Academia Dueña",
    });
    const otherSession = await createAcademySession({
      email: "bailarines.other.scope@example.com",
      academyName: "Academia Ajena",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: ownerSession.academyId,
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
      })
      .returning();

    await expectThrownResponse(
      loadPortalDancerDetail({
        request: new Request(
          `http://localhost/portal/bailarines/${dancer.id}`,
          {
            headers: { cookie: otherSession.cookie },
          },
        ),
        params: { dancerId: dancer.id },
      }),
      404,
    );

    await expectThrownResponse(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancer.id}`,
          otherSession.cookie,
          dancerEditFormData({
            firstName: "Ana",
            lastName: "Alvarez",
            birthDate: "2014-02-01",
            documentType: "",
            documentNumber: "",
          }),
        ),
        params: { dancerId: dancer.id },
      }),
      404,
    );
  });

  test("archives and reactivates a Bailarín while keeping direct URL access", async () => {
    const session = await createAcademySession({
      email: "bailarines.archive@example.com",
      academyName: "Academia Archivo",
    });
    const [activeDancer, archivedDancer] = await db
      .insert(dancers)
      .values([
        {
          academyId: session.academyId,
          firstName: "Ana",
          lastName: "Activa",
          birthDate: "2014-02-01",
        },
        {
          academyId: session.academyId,
          firstName: "Beto",
          lastName: "Archivado",
          birthDate: "2013-03-02",
          active: false,
        },
      ])
      .returning();

    const archiveResponse = await expectThrownResponse(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${activeDancer.id}`,
          session.cookie,
          formData({ intent: "archive-dancer" }),
        ),
        params: { dancerId: activeDancer.id },
      }),
      302,
    );

    expect(archiveResponse.headers.get("location")).toBe(
      `/portal/bailarines/${activeDancer.id}?notificacion=bailarin-archivado`,
    );
    await expect(
      db.query.dancers.findFirst({ where: eq(dancers.id, activeDancer.id) }),
    ).resolves.toMatchObject({ active: false });

    const listData = await loadPortalDancersList(
      new Request("http://localhost/portal/bailarines", {
        headers: { cookie: session.cookie },
      }),
    );
    expect(listData.dancers).toMatchObject([
      { id: activeDancer.id, active: false },
      { id: archivedDancer.id, active: false },
    ]);

    const archivedDetailData = await loadPortalDancerDetail({
      request: new Request(
        `http://localhost/portal/bailarines/${activeDancer.id}`,
        {
          headers: { cookie: session.cookie },
        },
      ),
      params: { dancerId: activeDancer.id },
    });
    expect(archivedDetailData.dancer).toMatchObject({
      id: activeDancer.id,
      active: false,
    });

    const reactivateResponse = await expectThrownResponse(
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${activeDancer.id}`,
          session.cookie,
          formData({ intent: "reactivate-dancer" }),
        ),
        params: { dancerId: activeDancer.id },
      }),
      302,
    );

    expect(reactivateResponse.headers.get("location")).toBe(
      `/portal/bailarines/${activeDancer.id}?notificacion=bailarin-reactivado`,
    );
    await expect(
      db.query.dancers.findFirst({ where: eq(dancers.id, activeDancer.id) }),
    ).resolves.toMatchObject({ active: true });
  });
});

function formData(values: Record<string, string>) {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}

function dancerEditFormData(input: {
  firstName: string;
  lastName: string;
  birthDate: string;
  documentType: string;
  documentNumber: string;
  documentFrontImageStorageKey?: string;
  documentBackImageStorageKey?: string;
}) {
  const formData = new FormData();
  formData.set("intent", "update-dancer");
  formData.set("firstName", input.firstName);
  formData.set("lastName", input.lastName);
  formData.set("birthDate", input.birthDate);
  formData.set("documentType", input.documentType);
  formData.set("documentNumber", input.documentNumber);
  formData.set(
    "documentFrontImageStorageKey",
    input.documentFrontImageStorageKey ?? "",
  );
  formData.set(
    "documentBackImageStorageKey",
    input.documentBackImageStorageKey ?? "",
  );

  return formData;
}

async function createSavedEvent(
  overrides: Partial<Parameters<typeof createEvent>[0]> = {},
) {
  const result = await createEvent({
    name: "Evento",
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
    ...overrides,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

function date(value: string) {
  return new Date(value);
}

async function expectCreated<TRecord extends { id: string }>(
  resultPromise: Promise<{
    ok: boolean;
    record?: TRecord;
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected Bases del evento creation to succeed.");
  }

  return result.record;
}

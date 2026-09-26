import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { checkAssetAgainstPolicy } from "@/lib/storage/asset-kinds";
import { choreographies, choreographyDancers, dancers } from "@/db/schema";
import { createCategory } from "@/lib/categories/repository.server";
import { createModality } from "@/lib/modalities/repository.server";
import { activateEvent } from "@/lib/events/management.server";
import {
  invalidBirthDateMessage,
  underageBirthDateMessage,
} from "@/lib/dancers/birth-date";
import {
  createEventChoreographyFixture,
  createSavedEvent as createActiveEventFixture,
  fixedExperienceLevel,
} from "@/lib/events/bases-test-fixtures.server.db";
import {
  createPortalSavedEvent as createSavedEvent,
  testEventDate as date,
} from "@/lib/events/saved-event-test-support.server";
import { handlePortalDancerDetailAction } from "@/features/portal/dancers/detail/server";
import { loadPortalDancerDetail } from "@/features/portal/dancers/detail/server";
import { loadPortalDancersList } from "@/features/portal/dancers/list/server";
import {
  createAcademySession,
  createPortalPostRequest,
  expectThrownResponse,
} from "@/features/portal/test-support/db";
import { expectPersistedDancer } from "@/lib/test-support/person-detail-db-assertions";
import { acknowledgedDuplicateIdsField } from "@/lib/shared/duplicate-warning";
import { createFormData } from "@/lib/test-support/form-data";
import {
  allocateChoreographyNumberForTest,
  createScheduleForModalityFixture,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

const createDocumentImageSignedUrlMock = vi.hoisted(() => vi.fn());
const removeDocumentImagesMock = vi.hoisted(() => vi.fn());
const uploadDocumentImageMock = vi.hoisted(() => vi.fn());

// Only the factory is replaced: the shared read path and the key layout stay
// real, so this test cannot drift from them (#571).
vi.mock("@/lib/storage/dancer-documents.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/storage/dancer-documents.server")
  >()),
  createDefaultDancerDocumentStorage: () => ({
    createDocumentImageSignedUrl: createDocumentImageSignedUrlMock,
    removeDocumentImages: removeDocumentImagesMock,
    uploadDocumentImage: uploadDocumentImageMock,
  }),
}));

installDatabaseTestHooks();

beforeEach(() => {
  createDocumentImageSignedUrlMock.mockReset();
  removeDocumentImagesMock.mockReset();
  uploadDocumentImageMock.mockReset();
  vi.restoreAllMocks();
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
      // Delegated to the real policy so this fake cannot accept what the store
      // would reject, or reject what it would accept.
      const rejection = checkAssetAgainstPolicy("dancerDocumentImage", file);

      if (rejection) {
        return { ok: false, rejection };
      }

      const extension = file.type === "image/png" ? "png" : "jpg";

      return {
        ok: true,
        storageKey: `academies/${academyId}/dancers/${dancerId}/document-${side}.${extension}`,
      };
    },
  );
});

describe("handlePortalDancerDetailAction", () => {
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

    const result = await handlePortalDancerDetailAction({
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
    });

    expect(result).toMatchObject({
      status: "success",
      message: "Bailarín guardado.",
    });
    await expectPersistedDancer(dancer.id, {
      firstName: "Ana María",
      lastName: "De la Cruz",
      birthDate: "2014-05-06",
      documentType: "dni",
      documentNumber: "123456789",
    });
  });

  test("warns when another dancer of the academy has that name and birth date", async () => {
    const session = await createAcademySession({
      email: "bailarines.edit.samename@example.com",
      academyName: "Academia Homónimos",
    });
    const [twin] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2014-02-01",
      })
      .returning();
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Lu",
        lastName: "Paz",
        birthDate: "2014-02-01",
      })
      .returning();

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        dancerEditFormData({
          firstName: "ana",
          lastName: "paz",
          birthDate: "2014-02-01",
          documentType: "",
          documentNumber: "",
        }),
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({
      status: "warning",
      warning: {
        kind: "dancer-name",
        matches: [{ id: twin.id, label: "Ana Paz" }],
        scope: "portal",
      },
    });
    await expectPersistedDancer(dancer.id, { firstName: "Lu" });
  });

  test("saves once the matching dancer is acknowledged", async () => {
    const session = await createAcademySession({
      email: "bailarines.edit.acknowledged@example.com",
      academyName: "Academia Reconocida",
    });
    const [twin] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Paz",
        birthDate: "2014-02-01",
      })
      .returning();
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Lu",
        lastName: "Paz",
        birthDate: "2014-02-01",
      })
      .returning();
    const formData = dancerEditFormData({
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2014-02-01",
      documentType: "",
      documentNumber: "",
    });
    formData.append(acknowledgedDuplicateIdsField, twin.id);

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        formData,
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({ status: "success" });
    await expectPersistedDancer(dancer.id, { firstName: "Ana" });
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
    const schedule = await createScheduleForModalityFixture({
      eventId: event.id,
      modalityId: modality.id,
    });
    const choreographyNumber = await allocateChoreographyNumberForTest(
      event.id,
    );
    const [choreography] = await db
      .insert(choreographies)
      .values({
        choreographyNumber,
        academyId: session.academyId,
        eventId: event.id,
        name: "Solo con recálculo",
        groupType: "solo",
        modalityId: modality.id,
        scheduleId: schedule.id,
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

    const result = await handlePortalDancerDetailAction({
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
    });

    // The move to `Mayor`, which admits no level, cleared the stored one, and
    // the action reports it so the page can say so.
    expect(result).toMatchObject({
      status: "success",
      recategorisedChoreographies: [
        {
          choreographyId: choreography.id,
          name: "Solo con recálculo",
          categoryName: "Mayor",
          experienceLevelCleared: true,
        },
      ],
    });
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

  test("refuses a birth date correction that leaves a linked choreography without a category", async () => {
    const session = await createAcademySession({
      email: "bailarines.birthdate.refusal@example.com",
      academyName: "Academia Sin Categoría",
    });
    const event = await createSavedEvent({
      name: "Regional Sin Categoría",
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
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Sin",
        birthDate: "2014-05-01",
      })
      .returning();
    const schedule = await createScheduleForModalityFixture({
      eventId: event.id,
      modalityId: modality.id,
    });
    const choreographyNumber = await allocateChoreographyNumberForTest(
      event.id,
    );
    const [choreography] = await db
      .insert(choreographies)
      .values({
        choreographyNumber,
        academyId: session.academyId,
        eventId: event.id,
        name: "Solo sin repuesto",
        groupType: "solo",
        modalityId: modality.id,
        scheduleId: schedule.id,
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

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        dancerEditFormData({
          firstName: "Ana",
          lastName: "Sin",
          birthDate: "1995-05-01",
          documentType: "",
          documentNumber: "",
        }),
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        birthDate: `Con esta fecha de nacimiento, la coreografía n.º ${choreographyNumber} «Solo sin repuesto» queda sin categoría.`,
      },
    });
    await expectPersistedDancer(dancer.id, { birthDate: "2014-05-01" });
    await expect(
      db.query.choreographies.findFirst({
        columns: { categoryId: true, categoryAgeBasis: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      categoryId: youngerCategory.id,
      categoryAgeBasis: 12,
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

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        formData,
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({ status: "success" });
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

  test("rejects a birth date that is not a real date and keeps the stored one", async () => {
    const session = await createAcademySession({
      email: "bailarines.fecha.rota@example.com",
      academyName: "Academia Fecha Rota",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Fecha",
        birthDate: "2014-02-01",
      })
      .returning();

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        dancerEditFormData({
          firstName: "Ana",
          lastName: "Fecha",
          birthDate: "01/02/2014",
          documentType: "",
          documentNumber: "",
        }),
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: { birthDate: invalidBirthDateMessage },
      values: { birthDate: "01/02/2014" },
    });
    await expectPersistedDancer(dancer.id, { birthDate: "2014-02-01" });
  });

  test("rejects a dancer under one year old at the active event start", async () => {
    const event = await createSavedEvent({
      name: "Regional Edad Mínima",
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
    });
    await activateEvent(event.id);
    const session = await createAcademySession({
      email: "bailarines.edad.minima@example.com",
      academyName: "Academia Edad Mínima",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Edad",
        birthDate: "2014-02-01",
      })
      .returning();

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        dancerEditFormData({
          firstName: "Ana",
          lastName: "Edad",
          birthDate: "2026-01-15",
          documentType: "",
          documentNumber: "",
        }),
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: { birthDate: underageBirthDateMessage },
      values: { birthDate: "2026-01-15" },
    });
    await expectPersistedDancer(dancer.id, { birthDate: "2014-02-01" });
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

    const result = await handlePortalDancerDetailAction({
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
    });

    expect(result).toMatchObject({ status: "success" });
    await expectPersistedDancer(dancer.id, {
      documentType: null,
      documentNumber: null,
      documentFrontImageStorageKey: "dancers/mora-front.jpg",
      documentBackImageStorageKey: "dancers/mora-back.jpg",
    });
  });

  // The key fields only say whether the academy kept or removed the photo: a
  // key the browser sends is never written, or it could point this dancer at
  // any file on the volume.
  test("keeps the stored photo keys whatever key the form submits", async () => {
    const { dancer, session } = await createDancerWithPhotos("Clave ajena");

    const result = await saveDancerPhotos(session.cookie, dancer.id, {
      documentBackImageStorageKey:
        "academies/other/dancers/x/document-back.jpg",
      documentFrontImageStorageKey:
        "academies/other/dancers/x/document-front.jpg",
    });

    expect(result).toMatchObject({ status: "success" });
    await expectPersistedDancer(dancer.id, {
      documentBackImageStorageKey: dancer.documentBackImageStorageKey,
      documentFrontImageStorageKey: dancer.documentFrontImageStorageKey,
    });
    expect(removeDocumentImagesMock).not.toHaveBeenCalled();
  });

  // A merge can leave a dancer's photo in another dancer's or another
  // academy's folder; the replaced file is found by its stored key.
  test("deletes a replaced photo by its stored key, even outside the dancer's folder", async () => {
    const { dancer, session } = await createDancerWithPhotos("Reemplazo");
    const formData = photoFormData(dancer);

    formData.set(
      "documentFrontImage",
      new File(["front"], "frente.png", { type: "image/png" }),
    );

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        formData,
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({ status: "success" });
    await expectPersistedDancer(dancer.id, {
      documentBackImageStorageKey: dancer.documentBackImageStorageKey,
      documentFrontImageStorageKey: `academies/${session.academyId}/dancers/${dancer.id}/document-front.png`,
    });
    expect(removeDocumentImagesMock).toHaveBeenCalledWith([
      dancer.documentFrontImageStorageKey,
    ]);
  });

  test("deletes a photo's file when the academy removes it", async () => {
    const { dancer, session } = await createDancerWithPhotos("Borrada");

    const result = await saveDancerPhotos(session.cookie, dancer.id, {
      documentBackImageStorageKey: "",
      documentFrontImageStorageKey: "kept",
    });

    expect(result).toMatchObject({ status: "success" });
    await expectPersistedDancer(dancer.id, {
      documentBackImageStorageKey: null,
      documentFrontImageStorageKey: dancer.documentFrontImageStorageKey,
    });
    expect(removeDocumentImagesMock).toHaveBeenCalledWith([
      dancer.documentBackImageStorageKey,
    ]);
  });

  test("keeps the save when deleting a removed photo fails, and logs it", async () => {
    const { dancer, session } = await createDancerWithPhotos("Huerfana");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    removeDocumentImagesMock.mockRejectedValue(new Error("volume unavailable"));

    const result = await saveDancerPhotos(session.cookie, dancer.id, {
      documentBackImageStorageKey: "",
      documentFrontImageStorageKey: "kept",
    });

    expect(result).toMatchObject({ status: "success" });
    await expectPersistedDancer(dancer.id, {
      documentBackImageStorageKey: null,
    });
    expect(errors).toHaveBeenCalledWith("[storage:dancer-document:orphan]", {
      dancerId: dancer.id,
      detail: "volume unavailable",
      storageKeys: [dancer.documentBackImageStorageKey],
    });
  });

  test("deletes nothing when the save is refused", async () => {
    const { dancer, session } = await createDancerWithPhotos("Rechazada");
    const formData = photoFormData(dancer, {
      documentBackImageStorageKey: "",
      documentFrontImageStorageKey: "",
    });

    formData.set("documentType", "");

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        formData,
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({ status: "error" });
    await expectPersistedDancer(dancer.id, {
      documentBackImageStorageKey: dancer.documentBackImageStorageKey,
      documentFrontImageStorageKey: dancer.documentFrontImageStorageKey,
    });
    expect(removeDocumentImagesMock).not.toHaveBeenCalled();
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

  test("rejects duplicate complete documents only within the same academy", async () => {
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
    await expectPersistedDancer(ownerEditable.id, {
      documentType: null,
      documentNumber: null,
    });

    const crossAcademyResult = await handlePortalDancerDetailAction({
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
    });

    expect(crossAcademyResult).toMatchObject({
      status: "success",
      message: "Bailarín guardado.",
    });
    await expectPersistedDancer(otherEditable.id, {
      documentType: "passport",
      documentNumber: "AB 123",
    });
    expect(ownerExisting.id).not.toBe(otherEditable.id);
  });

  test("rejects the same number under another type, and names an archived match", async () => {
    const session = await createAcademySession({
      email: "bailarines.document.number@example.com",
      academyName: "Academia Numero",
    });
    const [existing] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
        documentType: "dni",
        documentNumber: "30111222",
      })
      .returning();
    const [editable] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Beatriz",
        lastName: "Suarez",
        birthDate: "2013-03-02",
      })
      .returning();

    const editRequest = () =>
      createPortalPostRequest(
        `http://localhost/portal/bailarines/${editable.id}`,
        session.cookie,
        dancerEditFormData({
          firstName: "Beatriz",
          lastName: "Suarez",
          birthDate: "2013-03-02",
          documentType: "other",
          documentNumber: "30111222",
        }),
      );

    // The type differs, the number does not: one person, one row.
    expect(
      await handlePortalDancerDetailAction({
        request: editRequest(),
        params: { dancerId: editable.id },
      }),
    ).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un Bailarín con ese documento en tu academia.",
      },
      duplicateDocumentDancerId: existing.id,
    });
    await expectPersistedDancer(editable.id, {
      documentType: null,
      documentNumber: null,
    });

    await db
      .update(dancers)
      .set({ active: false })
      .where(eq(dancers.id, existing.id));

    expect(
      await handlePortalDancerDetailAction({
        request: editRequest(),
        params: { dancerId: editable.id },
      }),
    ).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un Bailarín archivado con ese documento en tu academia.",
      },
      duplicateDocumentDancerId: existing.id,
    });
  });

  test("returns not found when another academy loads or updates a dancer", async () => {
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

  test("returns the refusal as action data, without a 404, for a dancer participating in the active event", async () => {
    const session = await createAcademySession({
      email: "bailarines.archive.participante@example.com",
      academyName: "Academia Participante",
    });
    const activeEvent = await createActiveEventFixture("En Escena Activo", {
      activate: true,
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Participa",
        birthDate: "2014-02-01",
      })
      .returning();
    await createEventChoreographyFixture({
      academyId: session.academyId,
      dancerIds: [dancer.id],
      eventId: activeEvent.id,
      name: "Fragmentada",
    });

    const result = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        createFormData({ intent: "archive-dancer" }),
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({
      status: "error",
      message:
        "Este bailarín no puede archivarse porque está participando del evento activo.",
    });
    await expectPersistedDancer(dancer.id, { active: true });
  });

  test("archives and reactivates a dancer while keeping direct URL access", async () => {
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

    const archiveResult = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${activeDancer.id}`,
        session.cookie,
        createFormData({ intent: "archive-dancer" }),
      ),
      params: { dancerId: activeDancer.id },
    });

    expect(archiveResult).toMatchObject({
      status: "success",
      message: "Bailarín archivado.",
    });
    await expectPersistedDancer(activeDancer.id, { active: false });

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

    const reactivateResult = await handlePortalDancerDetailAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${activeDancer.id}`,
        session.cookie,
        createFormData({ intent: "reactivate-dancer" }),
      ),
      params: { dancerId: activeDancer.id },
    });

    expect(reactivateResult).toMatchObject({
      status: "success",
      message: "Bailarín reactivado.",
    });
    await expectPersistedDancer(activeDancer.id, { active: true });
  });
});

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

async function expectCreated<TRecord extends { id: string }>(
  resultPromise: Promise<{
    ok: boolean;
    record?: TRecord;
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected `Bases del evento` creation to succeed.");
  }

  return result.record;
}

/**
 * A dancer whose photos sit in another dancer's folder, as a merge leaves the
 * survivor that took the removed dancer's document.
 */
async function createDancerWithPhotos(academyName: string) {
  const session = await createAcademySession({
    email: `${academyName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    academyName: `Academia ${academyName}`,
  });
  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId: session.academyId,
      firstName: "Lola",
      lastName: "Foto",
      birthDate: "2012-05-06",
      documentType: "dni",
      documentNumber: "40111222",
      documentBackImageStorageKey: `academies/${session.academyId}/dancers/merged-away/document-back.jpg`,
      documentFrontImageStorageKey: `academies/${session.academyId}/dancers/merged-away/document-front.jpg`,
    })
    .returning();

  return { dancer, session };
}

function photoFormData(
  dancer: typeof dancers.$inferSelect,
  keys: {
    documentBackImageStorageKey?: string;
    documentFrontImageStorageKey?: string;
  } = {},
) {
  return dancerEditFormData({
    birthDate: dancer.birthDate,
    documentBackImageStorageKey:
      keys.documentBackImageStorageKey ??
      dancer.documentBackImageStorageKey ??
      "",
    documentFrontImageStorageKey:
      keys.documentFrontImageStorageKey ??
      dancer.documentFrontImageStorageKey ??
      "",
    documentNumber: dancer.documentNumber ?? "",
    documentType: dancer.documentType ?? "",
    firstName: dancer.firstName,
    lastName: dancer.lastName,
  });
}

function saveDancerPhotos(
  cookie: string,
  dancerId: string,
  keys: {
    documentBackImageStorageKey: string;
    documentFrontImageStorageKey: string;
  },
) {
  return db.query.dancers
    .findFirst({ where: eq(dancers.id, dancerId) })
    .then((dancer) =>
      handlePortalDancerDetailAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancerId}`,
          cookie,
          photoFormData(dancer!, keys),
        ),
        params: { dancerId },
      }),
    );
}

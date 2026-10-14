import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  categories,
  categoryModalities,
  choreographyDancers,
  choreographies,
} from "@/db/schema";
import { createModality } from "@/lib/modalities/repository.server";
import { createSchedule } from "@/lib/schedules/repository.server";
import { createScheduleCapacity } from "@/lib/schedules/capacities.server";
import {
  experienceLevelLabels,
  isExperienceLevel,
} from "@/lib/events/experience-levels";
import { acknowledgedDuplicateIdsField } from "@/lib/shared/duplicate-warning";
import { expectPersistedDancer } from "@/lib/test-support/person-detail-db-assertions";
import { createAcademyUser } from "@/lib/test-support/academies";
import { expectCreated } from "@/lib/events/bases.test-support";
import {
  action as detailAction,
  loader as detailLoader,
} from "@/routes/administracion.bailarines_.$dancerId";
import {
  allocateChoreographyNumberForTest,
  readFixtureCapacityScheduleId,
} from "@/lib/choreographies/registration.test-support";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { expectThrownResponse } from "@/lib/test-support/http";
import { createSavedEvent } from "@/lib/test-support/events";
import {
  createDancer,
  linkDancerToEventChoreography,
  renderDetailRoute,
  detailRouteArgs,
} from "@/lib/admin/dancers/dancers-route.test-support";
import { createPostRequest } from "@/lib/admin/test-support/route";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

const createDocumentImageSignedUrlMock = vi.hoisted(() => vi.fn());

// Only the factory is replaced: the shared read path stays real, so the admin
// surface is exercised through the same loader the portal uses (#571).
vi.mock("@/lib/storage/dancer-documents.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/storage/dancer-documents.server")
  >()),
  createDefaultDancerDocumentStorage: () => ({
    createDocumentImageSignedUrl: createDocumentImageSignedUrlMock,
  }),
}));

installDatabaseTestHooks();

beforeEach(() => {
  createDocumentImageSignedUrlMock.mockReset();
  createDocumentImageSignedUrlMock.mockImplementation(
    async (storageKey: string) => `signed:${storageKey}`,
  );
});

describe("`/administracion/bailarines` route: editing a dancer", () => {
  test("updates a dancer in explicit edit mode", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.mutacion.bailarines.academia@example.com",
      academyName: "Academia Mutacion",
      contactName: "Nadia Mutacion",
      phone: "5555-5555",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "ana",
      lastName: "perez",
      birthDate: "2013-01-10",
    });
    const { request } = await createSignedInRequest({
      email: "admin.mutacion.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    const result = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "  maría del carmen ",
          lastName: " de la cruz ",
          birthDate: "2012-05-06",
          documentType: "dni",
          documentNumber: "12.345-678",
        }),
        dancer.id,
      ),
    );

    expect(result).toMatchObject({
      status: "success",
      message: "Bailarín guardado.",
      // The dancer belongs to no choreography, so the correction moved none.
      recategorisedChoreographies: [],
    });
    await expectPersistedDancer(dancer.id, {
      firstName: "María del Carmen",
      lastName: "de la Cruz",
      birthDate: "2012-05-06",
      documentType: "dni",
      documentNumber: "12345678",
      active: true,
    });
  });

  test("refuses a birth date that leaves the dancer under one when the event starts", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.bebe.bailarines.academia@example.com",
      academyName: "Academia Bebe",
      contactName: "Bruna Bebe",
      phone: "6666-6666",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Nina",
      lastName: "Bebe",
      birthDate: "2013-01-10",
    });
    const { request } = await createSignedInRequest({
      email: "admin.bebe.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    const result = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "Nina",
          lastName: "Bebe",
          birthDate: "2025-06-01",
          documentType: "",
          documentNumber: "",
        }),
        dancer.id,
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        birthDate:
          "El bailarín debe tener al menos 1 año cumplido cuando empieza el evento.",
      },
    });
    await expectPersistedDancer(dancer.id, { birthDate: "2013-01-10" });
  });

  test("rejects auditor, judge, and academy mutations", async () => {
    const academy = await createAcademyUser({
      email: "admin.roles.bailarines.academia@example.com",
      academyName: "Academia Roles",
      contactName: "Rita Roles",
      phone: "7777-7777",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Nora",
      lastName: "Roles",
      birthDate: "2013-03-03",
    });

    for (const role of ["auditor", "judge", "academy"] as const) {
      const { request } = await createSignedInRequest({
        email: `${role}.bailarines@example.com`,
        role,
        requestUrl: `http://localhost/administracion/bailarines/${dancer.id}`,
      });

      await expectThrownResponse(
        detailAction(
          detailRouteArgs(
            createPostRequest(
              request.url,
              request.headers.get("cookie") ?? "",
              {
                intent: "update-dancer",
                firstName: "Nora",
                lastName: "Roles",
                birthDate: "2013-03-03",
                documentType: "",
                documentNumber: "",
              },
            ),
            dancer.id,
          ),
        ),
        403,
      );
    }
  });

  test("saves a participating dancer without a correction reason", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.motivo.evento.bailarines.academia@example.com",
      academyName: "Academia Motivo Evento",
      contactName: "Mara Evento",
      phone: "8888-8888",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Lia",
      lastName: "Participa",
      birthDate: "2012-04-08",
    });
    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      dancerId: dancer.id,
      choreographyName: "Latido",
    });
    const { request } = await createSignedInRequest({
      email: "admin.motivo.evento.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    const result = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "Liana",
          lastName: "Participa",
          birthDate: "2012-04-08",
          documentType: "",
          documentNumber: "",
        }),
        dancer.id,
      ),
    );

    expect(result).toMatchObject({
      status: "success",
      message: "Bailarín guardado.",
    });
    await expectPersistedDancer(dancer.id, {
      firstName: "Liana",
      lastName: "Participa",
    });
  });

  test("warns when another dancer of the academy has that name and birth date", async () => {
    const academy = await createAcademyUser({
      email: "admin.homonimo.bailarines.academia@example.com",
      academyName: "Academia Homónimos",
      contactName: "Dora Homónimos",
      phone: "1010-1010",
    });
    const twin = await createDancer({
      academyId: academy.academy.id,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2011-02-02",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Bia",
      lastName: "Nueva",
      birthDate: "2011-02-02",
    });
    const { request } = await createSignedInRequest({
      email: "admin.homonimo.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}`,
    });

    const result = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "ana",
          lastName: "paz",
          birthDate: "2011-02-02",
          documentType: "",
          documentNumber: "",
        }),
        dancer.id,
      ),
    );

    expect(result).toMatchObject({
      status: "warning",
      warning: {
        kind: "dancer-name",
        matches: [{ id: twin.id, label: "Ana Paz" }],
        scope: "admin",
      },
    });
    await expectPersistedDancer(dancer.id, { firstName: "Bia" });
  });

  test("saves from the panel once the matching dancer is acknowledged", async () => {
    const academy = await createAcademyUser({
      email: "admin.homonimo.ok.bailarines.academia@example.com",
      academyName: "Academia Reconocida",
      contactName: "Dora Reconocida",
      phone: "1010-1010",
    });
    const twin = await createDancer({
      academyId: academy.academy.id,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2011-02-02",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Bia",
      lastName: "Nueva",
      birthDate: "2011-02-02",
    });
    const { request } = await createSignedInRequest({
      email: "admin.homonimo.ok.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}`,
    });

    const result = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "Ana",
          lastName: "Paz",
          birthDate: "2011-02-02",
          documentType: "",
          documentNumber: "",
          [acknowledgedDuplicateIdsField]: twin.id,
        }),
        dancer.id,
      ),
    );

    expect(result).toMatchObject({ status: "success" });
    await expectPersistedDancer(dancer.id, { firstName: "Ana" });
  });

  test("rejects a duplicate document within the same academy", async () => {
    const academy = await createAcademyUser({
      email: "admin.duplicado.bailarines.academia@example.com",
      academyName: "Academia Duplicados",
      contactName: "Dora Duplicados",
      phone: "1010-1010",
    });
    await createDancer({
      academyId: academy.academy.id,
      firstName: "Ana",
      lastName: "Original",
      birthDate: "2010-01-01",
      documentType: "dni",
      documentNumber: "12345678",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Bia",
      lastName: "Nueva",
      birthDate: "2011-02-02",
    });
    const { request } = await createSignedInRequest({
      email: "admin.duplicado.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}`,
    });

    const result = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "Bia",
          lastName: "Nueva",
          birthDate: "2011-02-02",
          documentType: "dni",
          documentNumber: "12 345 678",
        }),
        dancer.id,
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un bailarín con ese documento en la academia.",
      },
    });
  });

  test("refuses the same number under another type from the panel", async () => {
    const academy = await createAcademyUser({
      email: "admin.documento.numero.academia@example.com",
      academyName: "Academia Documento",
      contactName: "Ana Documento",
      phone: "1010-1010",
    });
    const existing = await createDancer({
      academyId: academy.academy.id,
      firstName: "Ana",
      lastName: "Original",
      birthDate: "2010-01-01",
      documentType: "dni",
      documentNumber: "30111222",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Bia",
      lastName: "Nueva",
      birthDate: "2011-02-02",
    });
    const { request } = await createSignedInRequest({
      email: "admin.documento.numero@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}`,
    });

    const result = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "Bia",
          lastName: "Nueva",
          birthDate: "2011-02-02",
          documentType: "other",
          documentNumber: "30111222",
        }),
        dancer.id,
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un bailarín con ese documento en la academia.",
      },
      duplicateDocumentDancerId: existing.id,
    });
  });

  test("keeps birth date recalculation warning out of the inline edit form", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.advertencia.bailarines.academia@example.com",
      academyName: "Academia Advertencia",
      contactName: "Alma Advertencia",
      phone: "1212-1212",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Vera",
      lastName: "Aviso",
      birthDate: "2013-08-08",
    });
    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      dancerId: dancer.id,
      choreographyName: "Persistencia",
    });
    const { request } = await createSignedInRequest({
      email: "admin.advertencia.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    const markup = renderDetailRoute(
      await detailLoader(detailRouteArgs(request, dancer.id)),
      dancer.id,
    );

    expect(markup).toContain("Guardar");
    expect(markup).not.toContain(
      "Si cambiás la fecha de nacimiento, las coreografías vinculadas pueden requerir recalcular categoría desde el flujo de Coreografías.",
    );
  });

  test("recalculates eligible linked choreographies after a birth date correction", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.fecha.bailarines.academia@example.com",
      academyName: "Academia Fecha",
      contactName: "Fabi Fecha",
      phone: "1313-1313",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Nina",
      lastName: "Fecha",
      birthDate: "2014-05-01",
    });
    const catalog = await createAdministrativeCorrectionCatalog(event.id, {
      olderCategoryKeepsLevel: false,
    });
    const choreography = await createAdministrativeLinkedChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      categoryId: catalog.youngerCategory.id,
      choreographyName: "Umbral",
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 12,
    });
    const { request } = await createSignedInRequest({
      email: "admin.fecha.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    const ninaResult = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "Nina",
          lastName: "Fecha",
          birthDate: "2011-05-01",
          documentType: "",
          documentNumber: "",
        }),
        dancer.id,
      ),
    );

    // The payload carries what the page reports back: the choreography moved
    // to a category that admits no level, so the stored one was cleared.
    expect(ninaResult).toMatchObject({
      status: "success",
      recategorisedChoreographies: [
        {
          choreographyId: choreography.id,
          name: "Umbral",
          categoryName: catalog.olderCategory.name,
          experienceLevelOutcome: "cleared",
        },
      ],
    });

    await expect(
      db.query.choreographyDancers.findFirst({
        columns: {
          ageAtEventStart: true,
        },
        where: and(
          eq(choreographyDancers.choreographyId, choreography.id),
          eq(choreographyDancers.dancerId, dancer.id),
        ),
      }),
    ).resolves.toMatchObject({
      ageAtEventStart: 15,
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: {
          categoryId: true,
          categoryCalculationMode: true,
          categoryAgeBasis: true,
          experienceLevelId: true,
          groupType: true,
          scheduleCapacityId: true,
        },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      categoryId: catalog.olderCategory.id,
      categoryCalculationMode: "oldest",
      categoryAgeBasis: 15,
      experienceLevelId: null,
      groupType: "solo",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
  });

  test("refuses a birth date correction that leaves a linked choreography without a category", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.sincategoria.bailarines.academia@example.com",
      academyName: "Academia Sin Categoría",
      contactName: "Sara Sin",
      phone: "1414-1414",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Nina",
      lastName: "Sin",
      birthDate: "2014-05-01",
    });
    const catalog = await createAdministrativeCorrectionCatalog(event.id, {
      olderCategoryKeepsLevel: false,
    });
    const choreography = await createAdministrativeLinkedChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      categoryId: catalog.youngerCategory.id,
      choreographyName: "Sin repuesto",
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 12,
    });
    const { request } = await createSignedInRequest({
      email: "admin.sincategoria.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    const result = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "Nina",
          lastName: "Sin",
          birthDate: "1995-05-01",
          documentType: "",
          documentNumber: "",
        }),
        dancer.id,
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        birthDate: `Con esta fecha de nacimiento, la coreografía n.º ${choreography.choreographyNumber} «Sin repuesto» queda sin categoría.`,
      },
    });
    await expectPersistedDancer(dancer.id, { birthDate: "2014-05-01" });
    await expect(
      db.query.choreographies.findFirst({
        columns: { categoryId: true, categoryAgeBasis: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      categoryId: catalog.youngerCategory.id,
      categoryAgeBasis: 12,
    });
  });

  test("leaves persisted choreography data unchanged when a birth date correction does not move the competitive placement", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.fecha.sin-cambios.academia@example.com",
      academyName: "Academia Fecha Sin Cambios",
      contactName: "Nora Sin Cambios",
      phone: "1515-1515",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Lila",
      lastName: "Umbral",
      birthDate: "2014-01-10",
    });
    const catalog = await createAdministrativeCorrectionCatalog(event.id, {
      olderCategoryKeepsLevel: true,
    });
    const choreography = await createAdministrativeLinkedChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      categoryId: catalog.youngerCategory.id,
      choreographyName: "Sin cambio competitivo",
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 12,
    });
    const { request } = await createSignedInRequest({
      email: "admin.fecha.sin-cambios@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    const lilaResult = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "Lila",
          lastName: "Umbral",
          birthDate: "2014-02-20",
          documentType: "",
          documentNumber: "",
        }),
        dancer.id,
      ),
    );

    expect(lilaResult).toMatchObject({ status: "success" });

    await expect(
      db.query.choreographies.findFirst({
        columns: {
          categoryId: true,
          categoryCalculationMode: true,
          categoryAgeBasis: true,
          experienceLevelId: true,
        },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({
      categoryId: catalog.youngerCategory.id,
      categoryCalculationMode: "oldest",
      categoryAgeBasis: 12,
      experienceLevelId: catalog.level.id,
    });
    await expect(
      db.query.choreographyDancers.findFirst({
        columns: {
          ageAtEventStart: true,
        },
        where: and(
          eq(choreographyDancers.choreographyId, choreography.id),
          eq(choreographyDancers.dancerId, dancer.id),
        ),
      }),
    ).resolves.toMatchObject({
      ageAtEventStart: 12,
    });
  });

  test("verifies an unverified dancer, keeps it through a save that changes nothing it attests", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.verificacion.bailarines.academia@example.com",
      academyName: "Academia Verificable",
      contactName: "Violeta Verificable",
      phone: "1414-1414",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Paula",
      lastName: "Pendiente",
      birthDate: "2012-06-12",
      documentType: "dni",
      documentNumber: "12345678",
      documentFrontImageStorageKey: "dancers/paula-front.jpg",
      documentBackImageStorageKey: "dancers/paula-back.jpg",
    });
    const { request } = await createSignedInRequest({
      email: "admin.verificacion.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    const readOnlyMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(request, dancer.id)),
      dancer.id,
    );
    expect(readOnlyMarkup).toContain(
      "La documentación está lista para verificar la identidad del bailarín.",
    );
    expect(readOnlyMarkup).not.toContain("Para verificar");
    expect(readOnlyMarkup).toContain("Verificar");

    const verifyResult = await detailAction(
      detailRouteArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "verify-dancer-identity",
        }),
        dancer.id,
      ),
    );

    expect(verifyResult).toMatchObject({
      status: "success",
      message: "Bailarín verificado.",
    });
    await expectPersistedDancer(dancer.id, {
      identityVerifiedAt: expect.any(Date),
    });

    const verifiedRequestUrl = `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`;
    const verifiedMarkup = renderDetailRoute(
      await detailLoader(
        detailRouteArgs(
          new Request(verifiedRequestUrl, {
            headers: { cookie: request.headers.get("cookie") ?? "" },
          }),
          dancer.id,
        ),
      ),
      dancer.id,
    );
    expect(verifiedMarkup).toContain("La identidad fue verificada.");
    expect(verifiedMarkup).toContain('name="birthDate" value="2012-06-12"');
    expect(verifiedMarkup).toContain('name="documentType" value="dni"');
    expect(verifiedMarkup).toContain('name="documentNumber" value="12345678"');
    expect(verifiedMarkup).toContain("signed:dancers/paula-front.jpg");
    expect(verifiedMarkup).toContain("signed:dancers/paula-back.jpg");
    expect(verifiedMarkup).toContain(
      'name="documentFrontImageStorageKey" value="dancers/paula-front.jpg"',
    );
    expect(verifiedMarkup).toContain(
      'name="documentBackImageStorageKey" value="dancers/paula-back.jpg"',
    );
    expect(verifiedMarkup).toContain("Abrir imagen");

    // The panel ignores submitted image keys, so this save changes nothing
    // the document attests.
    const noOpResult = await detailAction(
      detailRouteArgs(
        createPostRequest(
          verifiedRequestUrl,
          request.headers.get("cookie") ?? "",
          {
            intent: "update-dancer",
            firstName: "PAULA",
            lastName: "Pendiente",
            birthDate: "2012-06-12",
            documentType: "dni",
            documentNumber: "12.345.678",
            documentFrontImageStorageKey: "dancers/paula-front-v2.jpg",
            documentBackImageStorageKey: "dancers/paula-back-v2.jpg",
          },
        ),
        dancer.id,
      ),
    );
    expect(noOpResult).toMatchObject({
      status: "success",
      message: "Bailarín guardado.",
    });

    await expect(
      readVerificationCode(
        verifiedRequestUrl,
        request.headers.get("cookie") ?? "",
        dancer.id,
      ),
    ).resolves.toBe("verified");
  });

  test.each([
    ["first name", { firstName: "Paulina" }],
    ["last name", { lastName: "Pérez" }],
    ["birth date", { birthDate: "2012-06-13" }],
    ["document type", { documentType: "passport" }],
    ["document number", { documentNumber: "12345679" }],
  ])(
    "clears a verified dancer's verification when the %s changes",
    async (_field, change) => {
      const { cookie, dancer, requestUrl } = await seedVerifiedDancer();

      const result = await detailAction(
        detailRouteArgs(
          createPostRequest(requestUrl, cookie, {
            intent: "update-dancer",
            ...verifiedDancerValues,
            ...change,
          }),
          dancer.id,
        ),
      );

      expect(result).toMatchObject({
        status: "success",
        message: "Bailarín guardado. La identidad quedó sin verificar.",
      });
      await expect(
        readVerificationCode(requestUrl, cookie, dancer.id),
      ).resolves.toBe("unverified");
    },
  );

  test("keeps a verified dancer's verification through archiving and reactivating", async () => {
    const { cookie, dancer, requestUrl } = await seedVerifiedDancer();

    for (const intent of ["archive-dancer", "reactivate-dancer"]) {
      await detailAction(
        detailRouteArgs(
          createPostRequest(requestUrl, cookie, { intent }),
          dancer.id,
        ),
      );
    }

    await expect(
      readVerificationCode(requestUrl, cookie, dancer.id),
    ).resolves.toBe("verified");
  });

  test("rejects verifying a dancer whose document is incomplete", async () => {
    const { cookie, dancer, requestUrl } = await seedVerifiedDancer({
      documentBackImageStorageKey: null,
      identityVerifiedAt: null,
    });

    await expectThrownResponse(
      detailAction(
        detailRouteArgs(
          createPostRequest(requestUrl, cookie, {
            intent: "verify-dancer-identity",
          }),
          dancer.id,
        ),
      ),
      400,
    );
    await expect(
      readVerificationCode(requestUrl, cookie, dancer.id),
    ).resolves.toBe("incomplete");
  });

  test("rejects verifying a dancer whose identity is already verified", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const academy = await createAcademyUser({
      email: "admin.verificacion.repetida.bailarines.academia@example.com",
      academyName: "Academia Verificada",
      contactName: "Vera Verificada",
      phone: "1515-1515",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Sonia",
      lastName: "Verificada",
      birthDate: "2012-01-02",
      documentType: "dni",
      documentNumber: "87654321",
      documentFrontImageStorageKey: "dancers/sonia-front.jpg",
      documentBackImageStorageKey: "dancers/sonia-back.jpg",
      identityVerifiedAt: new Date("2026-04-10T10:00:00Z"),
    });
    const { request } = await createSignedInRequest({
      email: "admin.verificacion.repetida.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });

    await expectThrownResponse(
      detailAction(
        detailRouteArgs(
          createPostRequest(request.url, request.headers.get("cookie") ?? "", {
            intent: "verify-dancer-identity",
          }),
          dancer.id,
        ),
      ),
      400,
    );
  });
});

const verifiedDancerValues = {
  firstName: "Paula",
  lastName: "Pendiente",
  birthDate: "2012-06-12",
  documentType: "dni",
  documentNumber: "12345678",
  documentFrontImageStorageKey: "dancers/paula-front.jpg",
  documentBackImageStorageKey: "dancers/paula-back.jpg",
};

/** The status the panel's detail shows, read through its loader. */
async function readVerificationCode(
  requestUrl: string,
  cookie: string,
  dancerId: string,
) {
  const loaderData = await detailLoader(
    detailRouteArgs(new Request(requestUrl, { headers: { cookie } }), dancerId),
  );

  return loaderData.dancer.verificationStatus.code;
}

async function seedVerifiedDancer(
  overrides: Partial<Parameters<typeof createDancer>[0]> = {},
) {
  const unique = crypto.randomUUID();
  const academy = await createAcademyUser({
    email: `verificada.${unique}@example.com`,
    academyName: `Academia ${unique}`,
    contactName: "Vera Verificada",
    phone: "1616-1616",
  });
  const dancer = await createDancer({
    academyId: academy.academy.id,
    ...verifiedDancerValues,
    documentType: "dni",
    identityVerifiedAt: new Date("2026-04-10T10:00:00Z"),
    ...overrides,
  });
  const requestUrl = `http://localhost/administracion/bailarines/${dancer.id}`;
  const { request } = await createSignedInRequest({
    email: `admin.${unique}@example.com`,
    role: "admin",
    requestUrl,
  });

  return {
    cookie: request.headers.get("cookie") ?? "",
    dancer,
    requestUrl,
  };
}

async function createAdministrativeCorrectionCatalog(
  eventId: string,
  input: { olderCategoryKeepsLevel: boolean },
) {
  const modality = await expectCreated(
    createModality(eventId, {
      name: `Cat Mod ${eventId}`,
    }),
  );
  const level = await createAdministrativeExperienceLevel(eventId);
  const [youngerCategory] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Infantil ${eventId}`,
      minAge: 8,
      maxAge: 12,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      experienceLevels: [level.id],
      experienceLevelKey: level.id,
    })
    .returning();
  const [olderCategory] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Juvenil ${eventId}`,
      minAge: 13,
      maxAge: 17,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      experienceLevels: input.olderCategoryKeepsLevel ? [level.id] : [],
      experienceLevelKey: input.olderCategoryKeepsLevel ? level.id : "",
    })
    .returning();

  await db.insert(categoryModalities).values([
    {
      categoryId: youngerCategory.id,
      modalityId: modality.id,
    },
    {
      categoryId: olderCategory.id,
      modalityId: modality.id,
    },
  ]);
  const block = await expectCreated(
    createSchedule(eventId, {
      name: `Cat Bloque ${eventId}`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
      modalityIds: [modality.id],
    }),
  );
  const scheduleCapacity = await expectCreated(
    createScheduleCapacity(block.id, {
      groupType: "solo",
      capacity: 10,
    }),
  );

  return {
    modality,
    level,
    youngerCategory,
    olderCategory,
    scheduleCapacity,
  };
}

async function createAdministrativeExperienceLevel(eventId: string) {
  return {
    id: "amateur",
    eventId,
    name: experienceLevelLabels.amateur,
  } as const;
}

async function createAdministrativeLinkedChoreography(input: {
  eventId: string;
  academyId: string;
  choreographyName: string;
  modalityId: string;
  categoryId: string;
  experienceLevelId: string | null;
  scheduleCapacityId: string;
}) {
  const choreographyNumber = await allocateChoreographyNumberForTest(
    input.eventId,
  );
  const [choreography] = await db
    .insert(choreographies)
    .values({
      choreographyNumber,
      eventId: input.eventId,
      academyId: input.academyId,
      name: input.choreographyName,
      modalityId: input.modalityId,
      groupType: "solo",
      categoryId: input.categoryId,
      categoryCalculationMode: "oldest",
      categoryAgeBasis: 12,
      experienceLevelId:
        input.experienceLevelId && isExperienceLevel(input.experienceLevelId)
          ? input.experienceLevelId
          : null,
      scheduleId: await readFixtureCapacityScheduleId(input.scheduleCapacityId),
      scheduleCapacityId: input.scheduleCapacityId,
    })
    .returning();

  return choreography;
}

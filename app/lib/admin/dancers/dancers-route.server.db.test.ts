import { and, asc, eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  administrativeAuditEntries,
  categories,
  categoryModalities,
  choreographyDancers,
  choreographies,
  dancers,
} from "@/db/schema";
import { createModality } from "@/lib/modalities/repository.server";
import { createPrice } from "@/lib/prices/repository.server";
import {
  createSchedule,
  createScheduleCapacity,
} from "@/lib/schedules/repository.server";
import {
  experienceLevelLabels,
  isExperienceLevel,
} from "@/lib/events/experience-levels";
import {
  toAdminDancerIdentificationSearchValue,
  toAdminDancerParticipationSearchValue,
  toAdminDancerStatusSearchValue,
} from "@/lib/admin/dancers/dancers.shared";
import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { renderAdminChildRoute } from "@/lib/admin/test-support/render-admin-child-route";
import { expectPersistedDancer } from "@/lib/test-support/person-detail-db-assertions";
import { createAcademyUser } from "@/lib/test-support/academies";
import {
  createEventChoreographyFixture,
  createEventFixtureDates,
  createSavedEvent as createSavedEventFixture,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";
import {
  AdministracionBailarinesRouteView,
  handle as bailarinesHandle,
  loader,
} from "@/routes/administracion.bailarines";
import {
  AdministracionBailarinDetalleRouteView,
  action as detailAction,
  handle as bailarinDetalleHandle,
  loader as detailLoader,
} from "@/routes/administracion.bailarines_.$dancerId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

const createDocumentImageSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/storage/dancer-documents.server", () => ({
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

describe.sequential("administracion/bailarines route", () => {
  test("allows admin access and renders an empty readonly Bailarines list", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.bailarines@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/bailarines",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData).not.toHaveProperty("email");
    expect(loaderData).not.toHaveProperty("events");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain(
      "No hay Bailarines que coincidan con la búsqueda.",
    );
    expect(markup).not.toContain("Acciones");
  });

  test("allows auditor access and blocks academy and judge users", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.detail.access@example.com",
      academyName: "Academia Acceso",
      contactName: "Alicia Acceso",
      phone: "5555-5555",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Dana",
      lastName: "Acceso",
      birthDate: "2013-09-09",
    });
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.bailarines@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}`,
    });

    await expect(loader(routeArgs(auditorRequest))).resolves.toMatchObject({
      selectedEventId: event.id,
    });

    const { request: academyRequest } = await createSignedInRequest({
      email: "academy.bailarines@example.com",
      role: "academy",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}`,
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.bailarines@example.com",
      role: "judge",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}`,
    });

    await expectThrownResponse(loader(routeArgs(academyRequest)), 403);
    await expectThrownResponse(loader(routeArgs(judgeRequest)), 403);
    await expectThrownResponse(
      detailLoader(detailRouteArgs(academyRequest, dancer.id)),
      403,
    );
    await expectThrownResponse(
      detailLoader(detailRouteArgs(judgeRequest, dancer.id)),
      403,
    );
  });

  test("uses the admin resource list behavior for participation, identification, search, filters, and pagination", async () => {
    const event = await createSavedEvent();
    const northAcademy = await createAcademyUser({
      email: "academia.dancers.norte@example.com",
      academyName: "Academia Norte",
      contactName: "Luz Norte",
      phone: "1111-1111",
    });
    const southAcademy = await createAcademyUser({
      email: "academia.dancers.sur@example.com",
      academyName: "Academia Sur",
      contactName: "Nora Sur",
      phone: "2222-2222",
    });
    const participatingDancer = await createDancer({
      academyId: northAcademy.academy.id,
      firstName: "Ana",
      lastName: "Participa",
      birthDate: "2012-01-10",
    });
    const identifiedDancer = await createDancer({
      academyId: southAcademy.academy.id,
      firstName: "Bruno",
      lastName: "Documento",
      birthDate: "2011-02-20",
      documentType: "dni",
      documentNumber: "2002",
    });
    const verifiedArchivedDancer = await createDancer({
      academyId: southAcademy.academy.id,
      firstName: "Beto",
      lastName: "Verificado",
      birthDate: "2011-02-21",
      active: false,
      documentType: "dni",
      documentNumber: "2003",
      documentFrontImageStorageKey: "front-verified",
      documentBackImageStorageKey: "back-verified",
      identityVerifiedAt: new Date("2026-04-01T12:00:00Z"),
    });
    const pendingVerificationDancer = await createDancer({
      academyId: southAcademy.academy.id,
      firstName: "Clara",
      lastName: "Pendiente",
      birthDate: "2011-03-21",
      documentType: "dni",
      documentNumber: "2004",
      documentFrontImageStorageKey: "front-pending",
      documentBackImageStorageKey: "back-pending",
    });
    const archivedDancer = await createDancer({
      academyId: northAcademy.academy.id,
      firstName: "Carla",
      lastName: "Archivada",
      birthDate: "2010-03-30",
      active: false,
      documentType: "passport",
      documentNumber: "AA3003",
    });

    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: northAcademy.academy.id,
      dancerId: participatingDancer.id,
      choreographyName: "Amanecer",
    });
    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: northAcademy.academy.id,
      dancerId: archivedDancer.id,
      choreographyName: "Noche",
    });

    for (let index = 0; index < 51; index += 1) {
      await createDancer({
        academyId: northAcademy.academy.id,
        firstName: `Extra ${index + 1}`,
        lastName: "Fila",
        birthDate: "2014-04-15",
      });
    }

    const { request: defaultRequest } = await createSignedInRequest({
      email: "admin.default.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}`,
    });
    const defaultData = await loader(routeArgs(defaultRequest));

    expect(defaultData.filters.participation).toBe("all");
    expect(defaultData.filters.status).toBe("active");
    expect(defaultData.filters.identification).toBe("all");
    expect(defaultData.totalCount).toBe(54);
    expect(defaultData.dancers.map((dancer) => dancer.id)).toContain(
      identifiedDancer.id,
    );
    expect(defaultData.dancers.map((dancer) => dancer.id)).toContain(
      pendingVerificationDancer.id,
    );
    expect(defaultData.dancers.map((dancer) => dancer.id)).not.toContain(
      archivedDancer.id,
    );
    const defaultMarkup = renderRoute(defaultData);
    expect(defaultMarkup).toContain("Sin verificar");
    expect(defaultMarkup).toContain('data-variant="info"');

    const { request: searchRequest } = await createSignedInRequest({
      email: "admin.search.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&participando=no&estado=todos&identificacion=incompleta&busqueda=Academia+Sur`,
    });
    const searchData = await loader(routeArgs(searchRequest));
    const searchMarkup = renderRoute(searchData);

    expect(searchData.filters.identification).toBe("incomplete");
    expect(searchData.dancers.map((dancer) => dancer.id)).toEqual([
      identifiedDancer.id,
    ]);
    expect(searchMarkup).toContain("No participando");
    expect(searchMarkup).toContain("Incompleto");
    expect(searchMarkup).not.toContain("Acciones");
    expect(searchMarkup).toContain(
      `/administracion/bailarines/${identifiedDancer.id}?busqueda=Academia+Sur`,
    );
    expect(searchMarkup).toContain("participando=no");
    expect(searchMarkup).toContain("estado=todos");
    expect(searchMarkup).not.toContain("identificacion=todos");
    expect(searchMarkup).toContain("busqueda=Academia+Sur");
    expect(searchMarkup).not.toContain(">Todos<");

    const { request: legacySearchRequest } = await createSignedInRequest({
      email: "admin.search.legacy.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&q=Academia+Sur&page=2`,
    });
    const legacySearchData = await loader(routeArgs(legacySearchRequest));

    expect(legacySearchData.filters.query).toBe("");
    expect(legacySearchData.filters.page).toBe(1);

    const { request: emptySearchRequest } = await createSignedInRequest({
      email: "admin.empty.search.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&participando=no&busqueda=No+existe`,
    });
    const emptySearchData = await loader(routeArgs(emptySearchRequest));
    const emptySearchMarkup = renderRoute(emptySearchData);

    expect(emptySearchData.dancers).toHaveLength(0);
    expect(emptySearchMarkup).toContain('value="No existe"');
    expect(emptySearchMarkup).toContain(
      "No hay Bailarines que coincidan con la búsqueda o los filtros.",
    );
    expect(emptySearchMarkup).not.toContain(
      "Todavía no hay Bailarines para mostrar.",
    );

    const { request: archivedRequest } = await createSignedInRequest({
      email: "admin.archived.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&estado=archivados&identificacion=todos`,
    });
    const archivedData = await loader(routeArgs(archivedRequest));
    const archivedMarkup = renderRoute(archivedData);

    expect(archivedData.dancers.map((dancer) => dancer.id)).toEqual([
      verifiedArchivedDancer.id,
      archivedDancer.id,
    ]);
    expect(archivedMarkup).toContain("Archivado");
    expect(archivedMarkup).toContain("Participando");

    const { request: pageTwoRequest } = await createSignedInRequest({
      email: "admin.pagination.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&participando=no&pagina=2`,
    });
    const pageTwoData = await loader(routeArgs(pageTwoRequest));
    const pageTwoMarkup = renderRoute(pageTwoData);

    expect(pageTwoData.totalCount).toBe(53);
    expect(pageTwoData.dancers).toHaveLength(3);
    expect(pageTwoData.filters.page).toBe(2);
    expect(pageTwoMarkup).toContain("3 de 53 registros");
    expect(pageTwoMarkup).toContain('aria-current="page"');
    expect(pageTwoMarkup).toContain(">Anterior<");
    expect(pageTwoMarkup).toContain(
      'href="/administracion/bailarines?participando=no"',
    );
    expect(pageTwoMarkup).toContain(
      'href="/administracion/bailarines?participando=no&amp;pagina=2"',
    );
  });

  test("shows active records without participation filters or badges when there is no Evento activo", async () => {
    const participatingAcademy = await createAcademyUser({
      email: "sin.evento.participa.dancers@example.com",
      academyName: "Academia Participa",
      contactName: "Ceci Participa",
      phone: "3333-3333",
    });
    const otherAcademy = await createAcademyUser({
      email: "sin.evento.dancers@example.com",
      academyName: "Academia Base",
      contactName: "Diego Base",
      phone: "4444-4444",
    });
    const event = await createInactiveEvent({
      name: "Evento histórico bailarines",
    });
    const participatingDancer = await createDancer({
      academyId: participatingAcademy.academy.id,
      firstName: "Diego",
      lastName: "Participa",
      birthDate: "2015-05-05",
    });
    const activeDancer = await createDancer({
      academyId: otherAcademy.academy.id,
      firstName: "Elena",
      lastName: "Base",
      birthDate: "2014-04-04",
      documentType: "dni",
      documentNumber: "12345678",
      documentFrontImageStorageKey: "front-active",
      documentBackImageStorageKey: "back-active",
    });
    await createDancer({
      academyId: otherAcademy.academy.id,
      firstName: "Fiona",
      lastName: "Archivada",
      birthDate: "2013-03-03",
      active: false,
    });
    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: participatingAcademy.academy.id,
      dancerId: participatingDancer.id,
      choreographyName: "Amanecer",
    });
    const { request } = await createSignedInRequest({
      email: "admin.no-event.dancers@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/bailarines",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData.selectedEventId).toBeNull();
    expect(loaderData.filters.participation).toBe("all");
    expect(loaderData.filters.identification).toBe("all");
    expect(loaderData.dancers.map((item) => item.id)).toEqual([
      participatingDancer.id,
      activeDancer.id,
    ]);
    expect(markup).not.toContain("Participando");
    expect(markup).not.toContain("No participando");
    expect(markup).not.toContain("Participación");
    expect(markup).toContain("Sin verificar");
  });

  test("renders a readonly Bailarín ficha with alerts, base context, tabs, and active-event inscriptions", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "ficha.dancer.academia@example.com",
      academyName: "Academia Ficha",
      contactName: "Elena Ficha",
      phone: "4444-4444",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Julia",
      lastName: "Detalle",
      birthDate: "2012-07-12",
      documentType: "passport",
      documentNumber: "AA123456",
      documentFrontImageStorageKey: "dancers/julia-front.jpg",
      documentBackImageStorageKey: "dancers/julia-back.jpg",
      createdAt: new Date("2026-01-10T12:00:00Z"),
      updatedAt: new Date("2026-06-05T15:30:00Z"),
    });

    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      dancerId: dancer.id,
      choreographyName: "Raíz",
    });

    const { request } = await createSignedInRequest({
      email: "auditor.detail.dancers@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&estado=todos&participando=todos&identificacion=todos&pagina=2&busqueda=Julia`,
    });

    const loaderData = await detailLoader(detailRouteArgs(request, dancer.id));
    const markup = renderDetailRoute(loaderData, dancer.id);

    expect(loaderData).not.toHaveProperty("email");
    expect(loaderData).not.toHaveProperty("eventOptions");
    expect(loaderData.dancer.inscriptions).toEqual([
      expect.objectContaining({
        choreographyName: "Raíz",
        groupType: "solo",
      }),
    ]);
    expect(markup).toContain("Detalle bailarín");
    expect(markup).toContain("Academia Ficha");
    expect(markup).toContain("Julia");
    expect(markup).toContain("Detalle");
    expect(markup).toContain("12 de julio de 2012");
    expect(markup).toContain("Tipo de documento");
    expect(markup).toContain("Pasaporte");
    expect(markup).toContain("Número de documento");
    expect(markup).toContain("AA123456");
    expect(markup).toContain("Imagen frente del documento");
    expect(markup).toContain("Imagen dorso del documento");
    expect(markup).toContain("Abrir imagen");
    expect(markup).toContain("signed:dancers/julia-front.jpg");
    expect(markup).toContain("signed:dancers/julia-back.jpg");
    expect(markup).not.toContain('value="dancers/julia-front.jpg"');
    expect(countOccurrences(markup, "lucide-lock")).toBeGreaterThanOrEqual(8);
    expect(markup).toContain(
      "La documentación está lista para verificar la identidad del bailarín.",
    );
    expect(markup).toContain("text-info");
    expect(markup).toContain("Identificación");
    expect(markup).toContain("Inscripciones");
    expect(markup).not.toContain(`evento=${event.id}`);
    expect(markup).toContain("estado=todos");
    expect(markup).toContain("participando=todos");
    expect(markup).toContain("identificacion=todos");
    expect(markup).toContain("pagina=2");
    expect(markup).toContain("busqueda=Julia");
    expect(markup).not.toContain("Editar");
    expect(markup).not.toContain("Acciones");
  });

  test("scopes inscription loader data to the Evento activo and resolves estimated values", async () => {
    const activeEvent = await createSavedEvent();
    const historicalEvent = await createInactiveEvent({
      name: "Regional histórico 2026",
    });
    const academy = await createAcademyUser({
      email: "inscripciones.detalle.academia@example.com",
      academyName: "Academia Inscripciones",
      contactName: "Ines Inscripciones",
      phone: "1234-5678",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Noelia",
      lastName: "Inscripta",
      birthDate: "2011-08-08",
      documentType: "dni",
      documentNumber: "22333444",
      documentFrontImageStorageKey: "front-inscripciones",
      documentBackImageStorageKey: "back-inscripciones",
    });
    const activeEventChoreography = await linkDancerToEventChoreography({
      eventId: activeEvent.id,
      academyId: academy.academy.id,
      dancerId: dancer.id,
      choreographyName: "Finale",
      groupType: "duo",
    });

    await expectCreated(
      createPrice(activeEvent.id, {
        groupType: "duo",
        amount: 1250000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    );

    await linkDancerToEventChoreography({
      eventId: historicalEvent.id,
      academyId: academy.academy.id,
      dancerId: dancer.id,
      choreographyName: "Histórica",
      groupType: "solo",
    });

    const { request } = await createSignedInRequest({
      email: "admin.con-inscripciones@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${activeEvent.id}`,
    });
    const loaderData = await detailLoader(detailRouteArgs(request, dancer.id));

    expect(loaderData.selectedEventId).toBe(activeEvent.id);

    expect(loaderData.dancer.inscriptions).toEqual([
      expect.objectContaining({
        id: activeEventChoreography.id,
        choreographyName: "Finale",
        groupType: "duo",
        basePriceAmount: 1250000,
        discountAmount: 0,
        estimatedSubtotalAmount: 1250000,
      }),
    ]);
    expect(loaderData.dancer.inscriptions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          choreographyName: "Histórica",
        }),
      ]),
    );
  });

  test("returns empty inscription loader data when the Bailarín has no active-event inscriptions", async () => {
    const activeEvent = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "sin.inscripciones.academia@example.com",
      academyName: "Academia Vacía",
      contactName: "Vera Vacia",
      phone: "9999-1111",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Tania",
      lastName: "Sin Evento",
      birthDate: "2012-02-02",
    });

    const { request } = await createSignedInRequest({
      email: "admin.sin-inscripciones@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${activeEvent.id}`,
    });
    const loaderData = await detailLoader(detailRouteArgs(request, dancer.id));

    expect(loaderData.selectedEventId).toBe(activeEvent.id);
    expect(loaderData.dancer.inscriptions).toEqual([]);
  });

  test("shows explicit edit controls only for admin users", async () => {
    const academy = await createAcademyUser({
      email: "admin.controles.bailarines.academia@example.com",
      academyName: "Academia Controles",
      contactName: "Carla Controles",
      phone: "6666-6666",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Iris",
      lastName: "Control",
      birthDate: "2013-06-06",
    });
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.controles.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}`,
    });
    const { request: adminEditRequest } = await createSignedInRequest({
      email: "admin.edicion.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?modo=editar`,
    });
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.controles.bailarines@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}`,
    });

    const adminMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(adminRequest, dancer.id)),
      dancer.id,
    );
    const adminEditMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(adminEditRequest, dancer.id)),
      dancer.id,
    );
    const auditorMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(auditorRequest, dancer.id)),
      dancer.id,
    );

    expect(adminMarkup).toContain("Editar");
    expect(adminMarkup).toContain("Acciones");
    expect(adminMarkup).not.toContain("Guardar");
    expect(adminEditMarkup).toContain("Guardar");
    expect(adminEditMarkup).toContain("Cancelar");
    expect(adminEditMarkup).toContain("Acciones");
    expect(auditorMarkup).not.toContain("Editar");
    expect(auditorMarkup).not.toContain("Guardar");
    expect(auditorMarkup).not.toContain("Acciones");
  });

  test("shows the shared archived alert in the administrative detail", async () => {
    const academy = await createAcademyUser({
      email: "admin.alertas.bailarines.academia@example.com",
      academyName: "Academia Alertas Bailarines",
      contactName: "Betina Alertas",
      phone: "4444-1212",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Lara",
      lastName: "Archivada",
      birthDate: "2014-03-12",
      active: false,
    });
    const { request } = await createSignedInRequest({
      email: "admin.alertas.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}`,
    });

    const markup = renderDetailRoute(
      await detailLoader(detailRouteArgs(request, dancer.id)),
      dancer.id,
    );

    expect(markup).toContain(
      "Este bailarín está archivado. Reactivalo para que vuelva a aparecer en las listas activas y en próximas selecciones de coreografías.",
    );
    expect(markup).toContain("Reactivar");
  });

  test("renders migrated Bailarines list and detail screens inside the shared administration shell", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "layout.bailarines.academia@example.com",
      academyName: "Academia Layout",
      contactName: "Laura Layout",
      phone: "4545-2323",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Julia",
      lastName: "Pérez",
      birthDate: "2012-07-12",
    });
    const { request: listRequest } = await createSignedInRequest({
      email: "admin.layout.bailarines.list@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}`,
    });
    const { request: detailRequest } = await createSignedInRequest({
      email: "admin.layout.bailarines.detail@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });
    const listLoaderData = await loader(routeArgs(listRequest));
    const detailLoaderData = await detailLoader(
      detailRouteArgs(detailRequest, dancer.id),
    );
    const listMarkup = renderRouteInAdminLayout({
      childId: "bailarines",
      childLoaderData: listLoaderData,
      childPath: "bailarines",
      childComponent: AdministracionBailarinesRouteView,
      childHandle: bailarinesHandle,
      initialEntry: "/administracion/bailarines",
      parentLoaderData: {
        email: "admin@example.com",
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });
    const detailMarkup = renderRouteInAdminLayout({
      childId: "bailarin-detalle",
      childLoaderData: detailLoaderData,
      childPath: "bailarines/:dancerId",
      childComponent: AdministracionBailarinDetalleRouteView,
      childHandle: bailarinDetalleHandle,
      initialEntry: `/administracion/bailarines/${dancer.id}`,
      parentLoaderData: {
        email: "admin@example.com",
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(listMarkup).toContain("Saltar al contenido principal");
    expect(listMarkup.match(/Saltar al contenido principal/g)).toHaveLength(1);
    expect(listMarkup).toContain("Bailarines");
    expect(listMarkup).toContain("Evento activo");
    expect(detailMarkup).toContain("Detalle bailarín");
    expect(detailMarkup).toContain('href="/administracion/bailarines"');
    expect(detailMarkup).toContain("Julia Pérez");
  });

  test("updates a Bailarín in explicit edit mode and persists an administrative audit entry", async () => {
    const event = await createSavedEvent();
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
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&modo=editar`,
    });

    const result = await detailAction(
      detailActionArgs(
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
    });
    await expectPersistedDancer(dancer.id, {
      firstName: "María del Carmen",
      lastName: "de la Cruz",
      birthDate: "2012-05-06",
      documentType: "dni",
      documentNumber: "12345678",
      active: true,
    });

    await expect(db.select().from(administrativeAuditEntries)).resolves.toEqual(
      [
        expect.objectContaining({
          entityType: "dancer",
          entityId: dancer.id,
          eventId: event.id,
          action: "update",
          reason: null,
          beforeValues: expect.objectContaining({
            firstName: "ana",
            lastName: "perez",
            birthDate: "2013-01-10",
            documentType: null,
            documentNumber: null,
            active: true,
          }),
          afterValues: expect.objectContaining({
            firstName: "María del Carmen",
            lastName: "de la Cruz",
            birthDate: "2012-05-06",
            documentType: "dni",
            documentNumber: "12345678",
            active: true,
          }),
        }),
      ],
    );
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
        requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?modo=editar`,
      });

      await expectThrownResponse(
        detailAction(
          detailActionArgs(
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

  test("saves a participating Bailarín without a correction reason and still writes the audit entry", async () => {
    const event = await createSavedEvent();
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
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&modo=editar`,
    });

    const result = await detailAction(
      detailActionArgs(
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
    await expect(db.select().from(administrativeAuditEntries)).resolves.toEqual(
      [
        expect.objectContaining({
          entityType: "dancer",
          entityId: dancer.id,
          eventId: event.id,
          action: "update",
          reason: null,
        }),
      ],
    );
  });

  test("saves a Bailarín who participated in any Evento without a correction reason and still writes the audit entry", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "admin.motivo.historial.bailarines.academia@example.com",
      academyName: "Academia Motivo Historial",
      contactName: "Marta Historial",
      phone: "9999-9999",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Lola",
      lastName: "Historial",
      birthDate: "2011-11-11",
    });
    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      dancerId: dancer.id,
      choreographyName: "Memoria",
    });
    const { request } = await createSignedInRequest({
      email: "admin.motivo.historial.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?modo=editar`,
    });

    const result = await detailAction(
      detailActionArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-dancer",
          firstName: "Lolita",
          lastName: "Historial",
          birthDate: "2011-11-11",
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
      firstName: "Lolita",
      lastName: "Historial",
    });
    await expect(db.select().from(administrativeAuditEntries)).resolves.toEqual(
      [
        expect.objectContaining({
          entityType: "dancer",
          entityId: dancer.id,
          action: "update",
          reason: null,
        }),
      ],
    );
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
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?modo=editar`,
    });

    const result = await detailAction(
      detailActionArgs(
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
          "Ya existe un Bailarín con ese documento en la academia.",
      },
    });
  });

  test("keeps birth date recalculation warning out of the inline edit form", async () => {
    const event = await createSavedEvent();
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
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&modo=editar`,
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

  test("recalculates eligible linked coreografias after a birth date correction and persists the audit reason", async () => {
    const event = await createSavedEvent();
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
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&modo=editar`,
    });

    const ninaResult = await detailAction(
      detailActionArgs(
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

    expect(ninaResult).toMatchObject({ status: "success" });

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
    await expect(
      db
        .select()
        .from(administrativeAuditEntries)
        .orderBy(
          asc(administrativeAuditEntries.createdAt),
          asc(administrativeAuditEntries.entityType),
        ),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "update",
        entityType: "dancer",
        entityId: dancer.id,
        eventId: event.id,
        reason: null,
        beforeValues: expect.objectContaining({ birthDate: "2014-05-01" }),
        afterValues: expect.objectContaining({ birthDate: "2011-05-01" }),
      }),
      expect.objectContaining({
        action: "update",
        entityType: "choreography",
        entityId: choreography.id,
        eventId: event.id,
        reason: null,
        beforeValues: expect.objectContaining({
          sourceDancer: expect.objectContaining({
            id: dancer.id,
          }),
          category: expect.objectContaining({
            id: catalog.youngerCategory.id,
          }),
          categoryCalculationMode: "oldest",
          categoryAgeBasis: 12,
          experienceLevel: expect.objectContaining({
            id: catalog.level.id,
          }),
          dancerCompetitiveAge: 12,
        }),
        afterValues: expect.objectContaining({
          sourceDancer: expect.objectContaining({
            id: dancer.id,
          }),
          category: expect.objectContaining({
            id: catalog.olderCategory.id,
          }),
          categoryCalculationMode: "oldest",
          categoryAgeBasis: 15,
          experienceLevel: null,
          dancerCompetitiveAge: 15,
        }),
      }),
    ]);
  });

  test("does not create a choreography audit when a birth date correction leaves persisted choreography data unchanged", async () => {
    const event = await createSavedEvent();
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
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&modo=editar`,
    });

    const lilaResult = await detailAction(
      detailActionArgs(
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
    await expect(
      db
        .select()
        .from(administrativeAuditEntries)
        .orderBy(
          asc(administrativeAuditEntries.createdAt),
          asc(administrativeAuditEntries.entityType),
        ),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "update",
        entityType: "dancer",
        entityId: dancer.id,
        reason: null,
        beforeValues: expect.objectContaining({ birthDate: "2014-01-10" }),
        afterValues: expect.objectContaining({ birthDate: "2014-02-20" }),
      }),
    ]);
  });

  test("verifies an unverified Bailarín and returns it to unverified after an administrative edit", async () => {
    const event = await createSavedEvent();
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
      detailActionArgs(
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

    const verifiedRequestUrl = `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&modo=editar`;
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

    const editResult = await detailAction(
      detailActionArgs(
        createPostRequest(
          verifiedRequestUrl,
          request.headers.get("cookie") ?? "",
          {
            intent: "update-dancer",
            firstName: "Paula",
            lastName: "Pendiente",
            birthDate: "2012-06-12",
            documentType: "dni",
            documentNumber: "12345678",
            documentFrontImageStorageKey: "dancers/paula-front-v2.jpg",
            documentBackImageStorageKey: "dancers/paula-back-v2.jpg",
          },
        ),
        dancer.id,
      ),
    );
    expect(editResult).toMatchObject({
      status: "success",
      message: "Bailarín guardado. La identidad volvió a no verificado.",
    });

    await expect(db.select().from(administrativeAuditEntries)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "dancer",
          entityId: dancer.id,
          action: "update",
          reason: null,
        }),
      ]),
    );

    await expectPersistedDancer(dancer.id, {
      documentFrontImageStorageKey: "dancers/paula-front.jpg",
      documentBackImageStorageKey: "dancers/paula-back.jpg",
      identityVerifiedAt: null,
    });
  });

  test("rejects verifying a Bailarín whose identity is already verified", async () => {
    const event = await createSavedEvent();
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
        detailActionArgs(
          createPostRequest(request.url, request.headers.get("cookie") ?? "", {
            intent: "verify-dancer-identity",
          }),
          dancer.id,
        ),
      ),
      400,
    );
  });

  test("archives and reactivates a participating Bailarín without unlinking coreografias and persists audit entries", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "admin.archivo.bailarines.academia@example.com",
      academyName: "Academia Archivo Admin",
      contactName: "Ada Archivo",
      phone: "1111-0000",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Rosa",
      lastName: "Archivo",
      birthDate: "2014-01-20",
    });
    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      dancerId: dancer.id,
      choreographyName: "Persistencia",
    });
    const { request } = await createSignedInRequest({
      email: "admin.archivo.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&modo=editar`,
    });

    const archiveResult = await detailAction(
      detailActionArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "archive-dancer",
          correctionReason: "Corrección manual por soporte.",
        }),
        dancer.id,
      ),
    );

    expect(archiveResult).toMatchObject({
      status: "success",
      message: "Bailarín archivado.",
    });
    await expectPersistedDancer(dancer.id, { active: false });

    const archivedDetail = await detailLoader(
      detailRouteArgs(request, dancer.id),
    );
    expect(archivedDetail.dancer.active).toBe(false);
    expect(archivedDetail.dancer.participationStatus).toBe("participating");
    expect(archivedDetail.dancer.choreographyNames).toEqual(["Persistencia"]);

    await expect(
      db
        .select()
        .from(choreographyDancers)
        .where(eq(choreographyDancers.dancerId, dancer.id)),
    ).resolves.toHaveLength(1);

    const reactivateResult = await detailAction(
      detailActionArgs(
        createPostRequest(
          `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&modo=editar`,
          request.headers.get("cookie") ?? "",
          {
            intent: "reactivate-dancer",
            correctionReason: "Reactivación operativa por soporte.",
          },
        ),
        dancer.id,
      ),
    );

    expect(reactivateResult).toMatchObject({
      status: "success",
      message: "Bailarín reactivado.",
    });
    await expectPersistedDancer(dancer.id, { active: true });
    await expect(
      db
        .select()
        .from(administrativeAuditEntries)
        .orderBy(administrativeAuditEntries.createdAt),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "archive",
        entityId: dancer.id,
        reason: "Corrección manual por soporte.",
        beforeValues: expect.objectContaining({ active: true }),
        afterValues: expect.objectContaining({ active: false }),
      }),
      expect.objectContaining({
        action: "reactivate",
        entityId: dancer.id,
        reason: "Reactivación operativa por soporte.",
        beforeValues: expect.objectContaining({ active: false }),
        afterValues: expect.objectContaining({ active: true }),
      }),
    ]);
  });
});

function renderRoute(
  loaderData: Parameters<
    typeof AdministracionBailarinesRouteView
  >[0]["loaderData"],
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [buildListInitialEntry(loaderData)],
      },
      createElement(AdministracionBailarinesRouteView, { loaderData }),
    ),
  );
}

function renderDetailRoute(
  loaderData: Parameters<
    typeof AdministracionBailarinDetalleRouteView
  >[0]["loaderData"],
  dancerId: string,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [`/administracion/bailarines/${dancerId}`],
      },
      createElement(AdministracionBailarinDetalleRouteView, { loaderData }),
    ),
  );
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}

function renderRouteInAdminLayout({
  childComponent,
  childHandle,
  childId,
  childLoaderData,
  childPath,
  initialEntry,
  parentLoaderData,
}: {
  childComponent:
    | typeof AdministracionBailarinesRouteView
    | typeof AdministracionBailarinDetalleRouteView;
  childHandle: unknown;
  childId: string;
  childLoaderData: unknown;
  childPath: string;
  initialEntry: string;
  parentLoaderData: {
    email: string;
    events: Array<{ active: boolean; id: string; name: string }>;
    selectedEventId: string | null;
  };
}) {
  return renderAdminChildRoute({
    childComponent,
    childHandle,
    childId,
    childLoaderData,
    childPath,
    initialEntry,
    parentLoaderData,
  });
}

function buildListInitialEntry(
  loaderData: Parameters<
    typeof AdministracionBailarinesRouteView
  >[0]["loaderData"],
) {
  const searchParams = new URLSearchParams();

  if (loaderData.filters.query.length > 0) {
    searchParams.set("busqueda", loaderData.filters.query);
  }

  if (loaderData.filters.nameOrder === "desc") {
    searchParams.set("orden", "nombre:desc");
  }

  if (
    loaderData.selectedEventId &&
    loaderData.filters.participation !== "all"
  ) {
    searchParams.set(
      "participando",
      toAdminDancerParticipationSearchValue(loaderData.filters.participation),
    );
  }

  if (loaderData.filters.status !== "active") {
    searchParams.set(
      "estado",
      toAdminDancerStatusSearchValue(loaderData.filters.status),
    );
  }

  if (loaderData.filters.identification !== "all") {
    searchParams.set(
      "identificacion",
      toAdminDancerIdentificationSearchValue(loaderData.filters.identification),
    );
  }

  if (loaderData.filters.page > 1) {
    searchParams.set("pagina", String(loaderData.filters.page));
  }

  const search = searchParams.toString();

  return `/administracion/bailarines${search.length > 0 ? `?${search}` : ""}`;
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/bailarines",
  };
}

function detailRouteArgs(request: Request, dancerId: string) {
  return {
    request,
    params: { dancerId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/bailarines/:dancerId",
  };
}

function detailActionArgs(request: Request, dancerId: string) {
  return {
    request,
    params: { dancerId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/bailarines/:dancerId",
  };
}

async function createDancer(input: {
  academyId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  active?: boolean;
  documentType?: "dni" | "passport" | "other" | null;
  documentNumber?: string | null;
  documentFrontImageStorageKey?: string | null;
  documentBackImageStorageKey?: string | null;
  identityVerifiedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId: input.academyId,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate,
      active: input.active ?? true,
      documentType: input.documentType ?? null,
      documentNumber: input.documentNumber ?? null,
      documentFrontImageStorageKey: input.documentFrontImageStorageKey ?? null,
      documentBackImageStorageKey: input.documentBackImageStorageKey ?? null,
      identityVerifiedAt: input.identityVerifiedAt ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    })
    .returning();

  return dancer;
}

async function createSavedEvent() {
  return createSavedEventFixture("Regional 2026", {
    activate: true,
    dates: createEventFixtureDates(2026),
  });
}

async function createInactiveEvent(input: { name: string }) {
  return createSavedEventFixture(input.name, {
    dates: createEventFixtureDates(2026),
  });
}

async function linkDancerToEventChoreography(input: {
  eventId: string;
  academyId: string;
  dancerId: string;
  choreographyName: string;
  groupType?: "solo" | "duo" | "trio" | "grupal";
}) {
  return createEventChoreographyFixture({
    eventId: input.eventId,
    academyId: input.academyId,
    name: input.choreographyName,
    groupType: input.groupType,
    dancerIds: [input.dancerId],
  });
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
  categoryId: string | null;
  experienceLevelId: string | null;
  scheduleCapacityId: string;
}) {
  const [choreography] = await db
    .insert(choreographies)
    .values({
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
      scheduleCapacityId: input.scheduleCapacityId,
    })
    .returning();

  return choreography;
}

function createPostRequest(
  url: string,
  cookie: string,
  values: Record<string, string>,
) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return new Request(url, {
    method: "POST",
    body: formData,
    headers: {
      cookie,
    },
  });
}

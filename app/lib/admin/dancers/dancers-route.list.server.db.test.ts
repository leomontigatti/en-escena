import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createPrice } from "@/lib/prices/repository.server";
import { buildDancerListSearch } from "@/lib/admin/dancers/dancers.shared";
import { renderAdminChildRoute } from "@/lib/admin/test-support/render-admin-child-route";
import { renderInDataRouter } from "@/lib/test-support/data-router";
import { createAcademyUser } from "@/lib/test-support/academies";
import { expectCreated } from "@/lib/events/bases.test-support";
import {
  DancersListRouteView,
  handle as bailarinesHandle,
  loader,
} from "@/routes/administracion.bailarines";
import {
  DancerDetailRouteView,
  handle as bailarinDetalleHandle,
  loader as detailLoader,
} from "@/routes/administracion.bailarines_.$dancerId";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { expectThrownResponse } from "@/lib/test-support/http";
import { createSavedEvent } from "@/lib/test-support/events";
import {
  createDancer,
  linkDancerToEventChoreography,
  renderDetailRoute,
  listRouteArgs,
  detailRouteArgs,
} from "@/lib/admin/dancers/dancers-route.test-support";

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

describe("`/administracion/bailarines` route: list and detail", () => {
  test("allows admin access and renders an empty readonly dancers list", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.bailarines@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/bailarines",
    });

    const loaderData = await loader(listRouteArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData).not.toHaveProperty("email");
    expect(loaderData).not.toHaveProperty("events");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain("Todavía no hay bailarines.");
    expect(markup).not.toContain("Acciones");
  });

  test("allows auditor access and blocks academy and judge users", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
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
      requestUrl: `http://localhost/administracion/bailarines`,
    });

    await expect(loader(listRouteArgs(auditorRequest))).resolves.toMatchObject({
      selectedEventId: event.id,
    });

    const { request: academyRequest } = await createSignedInRequest({
      email: "academy.bailarines@example.com",
      role: "academy",
      requestUrl: `http://localhost/administracion/bailarines`,
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.bailarines@example.com",
      role: "judge",
      requestUrl: `http://localhost/administracion/bailarines`,
    });

    await expectThrownResponse(loader(listRouteArgs(academyRequest)), 403);
    await expectThrownResponse(loader(listRouteArgs(judgeRequest)), 403);
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
    const event = await createSavedEvent({ name: "Regional 2026" });
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
      requestUrl: `http://localhost/administracion/bailarines`,
    });
    const defaultData = await loader(listRouteArgs(defaultRequest));

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
      requestUrl: `http://localhost/administracion/bailarines?participando=no&estado=todos&identificacion=incompleta&busqueda=Academia+Sur`,
    });
    const searchData = await loader(listRouteArgs(searchRequest));
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
    // "Todos" for the status is an applied filter now, shown as its own group.
    expect(searchMarkup).toContain('aria-label="Estado de alta: Todos"');

    const { request: legacySearchRequest } = await createSignedInRequest({
      email: "admin.search.legacy.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?q=Academia+Sur&page=2`,
    });
    const legacySearchRedirect = await expectThrownResponse(
      loader(listRouteArgs(legacySearchRequest)),
      302,
    );

    // `q` and `page` are not this product's vocabulary: they are dropped, not
    // read.
    expect(legacySearchRedirect.headers.get("Location")).toBe(
      "/administracion/bailarines",
    );

    const { request: emptySearchRequest } = await createSignedInRequest({
      email: "admin.empty.search.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?participando=no&busqueda=No+existe`,
    });
    const emptySearchData = await loader(listRouteArgs(emptySearchRequest));
    const emptySearchMarkup = renderRoute(emptySearchData);

    expect(emptySearchData.dancers).toHaveLength(0);
    expect(emptySearchMarkup).toContain('value="No existe"');
    expect(emptySearchMarkup).toContain(
      "No hay bailarines que coincidan con la búsqueda o los filtros.",
    );
    expect(emptySearchMarkup).not.toContain("Todavía no hay bailarines.");

    const { request: archivedRequest } = await createSignedInRequest({
      email: "admin.archived.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?estado=archivados`,
    });
    const archivedData = await loader(listRouteArgs(archivedRequest));
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
      requestUrl: `http://localhost/administracion/bailarines?participando=no&pagina=2`,
    });
    const pageTwoData = await loader(listRouteArgs(pageTwoRequest));
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

  test("shows active records without participation filters or badges when there is no event active", async () => {
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
    const event = await createSavedEvent({
      name: "Evento histórico bailarines",
      active: false,
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

    const loaderData = await loader(listRouteArgs(request));
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

  test("renders a readonly dancer ficha with alerts, base context, tabs, and active-event inscriptions", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
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
    expect(markup).toContain("Julia Detalle");
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

  test("scopes inscription loader data to the active event and prices it through the finance read model", async () => {
    const activeEvent = await createSavedEvent({ name: "Regional 2026" });
    const historicalEvent = await createSavedEvent({
      name: "Regional histórico 2026",
      active: false,
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
        // Deadline-less: it applies whatever the business date is, so the
        // expectation does not expire with the calendar.
        paymentDeadline: null,
        scheduleIds: [],
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
        choreographyNumber: activeEventChoreography.choreographyNumber,
        categoryName: "Finale Cat",
        groupType: "duo",
        basePriceAmount: 1250000,
        dancerDiscountAmount: 0,
        totalAmount: 1250000,
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

  test("returns empty inscription loader data when the dancer has no active-event inscriptions", async () => {
    const activeEvent = await createSavedEvent({ name: "Regional 2026" });
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

  test("shows the editable form to admins and only Volver to auditors", async () => {
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
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.controles.bailarines@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}`,
    });

    const adminMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(adminRequest, dancer.id)),
      dancer.id,
    );
    const auditorMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(auditorRequest, dancer.id)),
      dancer.id,
    );

    expect(adminMarkup).toContain("Guardar");
    expect(adminMarkup).toContain("Acciones");
    expect(adminMarkup).not.toContain("Editar");
    expect(adminMarkup).not.toContain("Cancelar");
    expect(auditorMarkup).not.toContain("Editar");
    expect(auditorMarkup).not.toContain("Cancelar");
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

  test("renders migrated dancers list and detail screens inside the shared administration shell", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
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
      requestUrl: `http://localhost/administracion/bailarines`,
    });
    const { request: detailRequest } = await createSignedInRequest({
      email: "admin.layout.bailarines.detail@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}`,
    });
    const listLoaderData = await loader(listRouteArgs(listRequest));
    const detailLoaderData = await detailLoader(
      detailRouteArgs(detailRequest, dancer.id),
    );
    const listMarkup = renderAdminChildRoute({
      childId: "bailarines",
      childLoaderData: listLoaderData,
      childPath: "bailarines",
      childComponent: DancersListRouteView,
      childHandle: bailarinesHandle,
      initialEntry: "/administracion/bailarines",
      parentLoaderData: {
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });
    const detailMarkup = renderAdminChildRoute({
      childId: "bailarin-detalle",
      childLoaderData: detailLoaderData,
      childPath: "bailarines/:dancerId",
      childComponent: DancerDetailRouteView,
      childHandle: bailarinDetalleHandle,
      initialEntry: `/administracion/bailarines/${dancer.id}`,
      parentLoaderData: {
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(listMarkup).toContain("Saltar al contenido principal");
    expect(listMarkup.match(/Saltar al contenido principal/g)).toHaveLength(1);
    expect(listMarkup).toContain("Bailarines");
    expect(listMarkup).toContain("Evento activo");
    expect(detailMarkup).toContain("Julia Pérez");
    expect(detailMarkup).toContain('href="/administracion/bailarines"');
    expect(detailMarkup).toContain("Julia Pérez");
  });
});

function renderRoute(
  loaderData: Parameters<typeof DancersListRouteView>[0]["loaderData"],
) {
  return renderToStaticMarkup(
    renderInDataRouter(
      buildListInitialEntry(loaderData),
      createElement(DancersListRouteView, { loaderData }),
    ),
  );
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}

function buildListInitialEntry(
  loaderData: Parameters<typeof DancersListRouteView>[0]["loaderData"],
) {
  const search = buildDancerListSearch(
    loaderData.filters,
    loaderData.selectedEventId,
  );

  return `/administracion/bailarines${search.length > 0 ? `?${search}` : ""}`;
}

import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  administrativeAuditEntries,
  choreographyProfessors,
  professors,
} from "@/db/schema";
import {
  toAdminProfessorParticipationSearchValue,
  toAdminProfessorStatusSearchValue,
} from "@/lib/admin/professors/professors.shared";
import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { renderAdminChildRoute } from "@/lib/admin/test-support/render-admin-child-route";
import { expectPersistedProfessor } from "@/lib/test-support/person-detail-db-assertions";
import { createAcademyUser } from "@/lib/test-support/academies";
import {
  createEventChoreographyFixture,
  createEventFixtureDates,
  createSavedEvent as createSavedEventFixture,
} from "@/lib/events/bases-test-fixtures.server.db";
import {
  AdministracionProfesoresRouteView,
  handle as profesoresHandle,
  loader,
} from "@/routes/administracion.profesores";
import {
  AdministracionProfesorDetalleRouteView,
  action as detailAction,
  handle as profesorDetalleHandle,
  loader as detailLoader,
} from "@/routes/administracion.profesores_.$professorId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/profesores route", () => {
  test("allows admin access and renders an empty readonly Profesores list", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.profesores@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/profesores",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData).not.toHaveProperty("email");
    expect(loaderData).not.toHaveProperty("events");
    expect(markup).toContain("Profesores");
    expect(markup).toContain("Todavía no hay Profesores para mostrar.");
    expect(markup).not.toContain("Acciones");
  });

  test("allows auditor access and blocks academy and judge users", async () => {
    const event = await createSavedEvent();
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.profesores@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}`,
    });

    await expect(loader(routeArgs(auditorRequest))).resolves.toMatchObject({
      selectedEventId: event.id,
    });

    const { request: academyRequest } = await createSignedInRequest({
      email: "academy.profesores@example.com",
      role: "academy",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}`,
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.profesores@example.com",
      role: "judge",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}`,
    });

    await expectThrownResponse(loader(routeArgs(academyRequest)), 403);
    await expectThrownResponse(loader(routeArgs(judgeRequest)), 403);
  });

  test("uses the admin resource list behavior for participation, search, filters, and pagination", async () => {
    const event = await createSavedEvent();
    const northAcademy = await createAcademyUser({
      email: "academia.norte@example.com",
      academyName: "Academia Norte",
      contactName: "Luz Norte",
      phone: "1111-1111",
    });
    const southAcademy = await createAcademyUser({
      email: "academia.sur@example.com",
      academyName: "Academia Sur",
      contactName: "Nora Sur",
      phone: "2222-2222",
    });
    const participatingProfessor = await createProfessor({
      academyId: northAcademy.academy.id,
      firstName: "Ana",
      lastName: "Participa",
      documentNumber: "1001",
    });
    const nonParticipatingProfessor = await createProfessor({
      academyId: southAcademy.academy.id,
      firstName: "Bruno",
      lastName: "Consulta",
      documentNumber: "2002",
    });
    const archivedProfessor = await createProfessor({
      academyId: northAcademy.academy.id,
      firstName: "Carla",
      lastName: "Archivada",
      active: false,
      documentNumber: "3003",
    });

    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: northAcademy.academy.id,
      professorId: participatingProfessor.id,
      choreographyName: "Amanecer",
    });
    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: northAcademy.academy.id,
      professorId: archivedProfessor.id,
      choreographyName: "Noche",
    });

    for (let index = 0; index < 51; index += 1) {
      await createProfessor({
        academyId: northAcademy.academy.id,
        firstName: `Extra ${index + 1}`,
        lastName: "Fila",
      });
    }

    const { request: defaultRequest } = await createSignedInRequest({
      email: "admin.filtros@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}`,
    });
    const defaultData = await loader(routeArgs(defaultRequest));

    expect(defaultData.filters.participation).toBe("all");
    expect(defaultData.filters.status).toBe("active");
    expect(defaultData.totalCount).toBe(53);
    expect(defaultData.professors.map((professor) => professor.id)).toContain(
      nonParticipatingProfessor.id,
    );
    expect(
      defaultData.professors.map((professor) => professor.id),
    ).not.toContain(archivedProfessor.id);

    const { request: searchRequest } = await createSignedInRequest({
      email: "admin.busqueda@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}&participando=no&busqueda=Academia+Sur`,
    });
    const searchData = await loader(routeArgs(searchRequest));
    const searchMarkup = renderRoute(searchData);

    expect(searchData.professors.map((professor) => professor.id)).toEqual([
      nonParticipatingProfessor.id,
    ]);
    expect(searchMarkup).toContain("No participando");
    expect(searchMarkup).not.toContain("Identificación incompleta");
    expect(searchMarkup).not.toContain("Identificación completa");
    expect(searchMarkup).not.toContain("Acciones");
    expect(searchMarkup).toContain(
      `/administracion/profesores/${nonParticipatingProfessor.id}?busqueda=Academia+Sur`,
    );
    expect(searchMarkup).toContain("participando=no");
    expect(searchMarkup).toContain("busqueda=Academia+Sur");
    expect(searchMarkup).not.toContain(">Todos<");

    const { request: legacySearchRequest } = await createSignedInRequest({
      email: "admin.busqueda.legacy@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}&q=Academia+Sur&page=2`,
    });
    const legacySearchData = await loader(routeArgs(legacySearchRequest));

    expect(legacySearchData.filters.query).toBe("");
    expect(legacySearchData.filters.page).toBe(1);

    const { request: emptySearchRequest } = await createSignedInRequest({
      email: "admin.busqueda.vacia@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}&participando=no&busqueda=No+existe`,
    });
    const emptySearchData = await loader(routeArgs(emptySearchRequest));
    const emptySearchMarkup = renderRoute(emptySearchData);

    expect(emptySearchData.professors).toHaveLength(0);
    expect(emptySearchMarkup).toContain('value="No existe"');
    expect(emptySearchMarkup).toContain(
      "No hay Profesores que coincidan con la búsqueda o los filtros.",
    );
    expect(emptySearchMarkup).not.toContain(
      "Todavía no hay Profesores para mostrar.",
    );

    const { request: archivedRequest } = await createSignedInRequest({
      email: "admin.archivados@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}&estado=archivados`,
    });
    const archivedData = await loader(routeArgs(archivedRequest));
    const archivedMarkup = renderRoute(archivedData);

    expect(archivedData.professors.map((professor) => professor.id)).toEqual([
      archivedProfessor.id,
    ]);
    expect(archivedMarkup).toContain("Archivado");
    expect(archivedMarkup).toContain("Participando");

    const { request: pageTwoRequest } = await createSignedInRequest({
      email: "admin.paginacion@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}&participando=no&pagina=2`,
    });
    const pageTwoData = await loader(routeArgs(pageTwoRequest));
    const pageTwoMarkup = renderRoute(pageTwoData);

    expect(pageTwoData.totalCount).toBe(52);
    expect(pageTwoData.professors).toHaveLength(2);
    expect(pageTwoData.filters.page).toBe(2);
    expect(pageTwoMarkup).toContain("2 de 52 registros");
    expect(pageTwoMarkup).toContain('aria-current="page"');
    expect(pageTwoMarkup).toContain(">Anterior<");
    expect(pageTwoMarkup).toContain(
      'href="/administracion/profesores?participando=no"',
    );
    expect(pageTwoMarkup).toContain(
      'href="/administracion/profesores?participando=no&amp;pagina=2"',
    );
  });

  test("shows active records without participation filters or badges when there is no Evento activo", async () => {
    const participatingAcademy = await createAcademyUser({
      email: "sin.evento.participa@example.com",
      academyName: "Academia Participa",
      contactName: "Ceci Participa",
      phone: "3333-3333",
    });
    const otherAcademy = await createAcademyUser({
      email: "sin.evento.base@example.com",
      academyName: "Academia Base",
      contactName: "Diego Base",
      phone: "4444-4444",
    });
    const event = await createInactiveEvent({
      name: "Evento histórico profesores",
    });
    const participatingProfessor = await createProfessor({
      academyId: participatingAcademy.academy.id,
      firstName: "Diego",
      lastName: "Participa",
    });
    const activeProfessor = await createProfessor({
      academyId: otherAcademy.academy.id,
      firstName: "Elena",
      lastName: "Base",
    });
    await createProfessor({
      academyId: otherAcademy.academy.id,
      firstName: "Fiona",
      lastName: "Archivada",
      active: false,
    });
    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: participatingAcademy.academy.id,
      professorId: participatingProfessor.id,
      choreographyName: "Amanecer",
    });
    const { request } = await createSignedInRequest({
      email: "admin.sin-evento@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/profesores",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData.selectedEventId).toBeNull();
    expect(loaderData.filters.participation).toBe("all");
    expect(loaderData.filters.status).toBe("active");
    expect(loaderData.professors.map((item) => item.id)).toEqual([
      participatingProfessor.id,
      activeProfessor.id,
    ]);
    expect(markup).not.toContain("Participando");
    expect(markup).not.toContain("No participando");
    expect(markup).not.toContain("Participación");
    expect(markup).toContain("Filtros");
  });

  test("renders a readonly Profesor detail with the single-card administrative layout", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "ficha.academia@example.com",
      academyName: "Academia Ficha",
      contactName: "Elena Ficha",
      phone: "4444-4444",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Julia",
      lastName: "Detalle",
      documentType: "passport",
      documentNumber: "AA123456",
      createdAt: new Date("2026-01-10T12:00:00Z"),
      updatedAt: new Date("2026-06-05T15:30:00Z"),
    });

    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      professorId: professor.id,
      choreographyName: "Raíz",
    });

    const { request } = await createSignedInRequest({
      email: "auditor.ficha@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?evento=${event.id}&pagina=2&busqueda=Julia`,
    });

    const loaderData = await detailLoader(
      detailRouteArgs(request, professor.id),
    );
    const markup = renderDetailRoute(loaderData, professor.id);

    expect(loaderData).not.toHaveProperty("email");
    expect(loaderData).not.toHaveProperty("eventOptions");
    expect(markup).toContain("Detalle profesor");
    expect(markup).toContain(
      "Revisá la información administrativa de este profesor.",
    );
    expect(markup).toContain("Academia Ficha");
    expect(markup).toContain("Julia");
    expect(markup).toContain("Detalle");
    expect(markup).toContain("Pasaporte");
    expect(markup).toContain("AA123456");
    expect(countOccurrences(markup, "lucide-lock")).toBeGreaterThanOrEqual(5);
    expect(markup).not.toContain(`evento=${event.id}`);
    expect(markup).not.toContain("estado=todos");
    expect(markup).not.toContain("participando=todos");
    expect(markup).toContain("pagina=2");
    expect(markup).toContain("busqueda=Julia");
    expect(markup).not.toContain("Editar");
    expect(markup).not.toContain("Acciones");
    expect(markup).not.toContain("Elena Ficha");
    expect(markup).not.toContain("ficha.academia@example.com");
    expect(markup).not.toContain("4444-4444");
    expect(markup).not.toContain("Participación");
    expect(markup).not.toContain("Trazabilidad");
  });

  test("renders migrated Profesores list and detail screens inside the shared administration shell", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "layout.academia@example.com",
      academyName: "Academia Layout",
      contactName: "Laura Layout",
      phone: "4545-2323",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Julia",
      lastName: "Pérez",
    });
    const { request: listRequest } = await createSignedInRequest({
      email: "admin.layout.list@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}`,
    });
    const { request: detailRequest } = await createSignedInRequest({
      email: "admin.layout.detail@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?evento=${event.id}`,
    });
    const listLoaderData = await loader(routeArgs(listRequest));
    const detailLoaderData = await detailLoader(
      detailRouteArgs(detailRequest, professor.id),
    );
    const listMarkup = renderRouteInAdminLayout({
      childId: "profesores",
      childLoaderData: listLoaderData,
      childPath: "profesores",
      childComponent: AdministracionProfesoresRouteView,
      childHandle: profesoresHandle,
      initialEntry: "/administracion/profesores",
      parentLoaderData: {
        email: "admin@example.com",
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });
    const detailMarkup = renderRouteInAdminLayout({
      childId: "profesor-detalle",
      childLoaderData: detailLoaderData,
      childPath: "profesores/:professorId",
      childComponent: AdministracionProfesorDetalleRouteView,
      childHandle: profesorDetalleHandle,
      initialEntry: `/administracion/profesores/${professor.id}`,
      parentLoaderData: {
        email: "admin@example.com",
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(listMarkup).toContain("Saltar al contenido principal");
    expect(listMarkup.match(/Saltar al contenido principal/g)).toHaveLength(1);
    expect(listMarkup).toContain("Profesores");
    expect(listMarkup).toContain("Evento activo");
    expect(detailMarkup).toContain("Detalle profesor");
    expect(detailMarkup).toContain('href="/administracion/profesores"');
    expect(detailMarkup).toContain("Julia Pérez");
  });

  test("shows archived and incomplete identification alerts in the administrative detail", async () => {
    const academy = await createAcademyUser({
      email: "alertas.academia@example.com",
      academyName: "Academia Alertas",
      contactName: "Alicia Alertas",
      phone: "4545-9898",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Rita",
      lastName: "Alerta",
      active: false,
    });
    const { request } = await createSignedInRequest({
      email: "admin.alertas@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}`,
    });

    const markup = renderDetailRoute(
      await detailLoader(detailRouteArgs(request, professor.id)),
      professor.id,
    );

    expect(markup).toContain(
      "Este profesor está archivado. Reactivalo para que vuelva a aparecer en las listas activas y en próximas selecciones de coreografías.",
    );
    expect(markup).toContain("Faltan datos de identificación.");
    expect(markup).not.toContain("Identificación incompleta");
    expect(markup).toContain("Reactivar");
  });

  test("shows explicit edit controls only for admin users", async () => {
    const academy = await createAcademyUser({
      email: "admin.controles.academia@example.com",
      academyName: "Academia Controles",
      contactName: "Carla Controles",
      phone: "6666-6666",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Iris",
      lastName: "Control",
    });
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin.controles@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}`,
    });
    const { request: adminEditRequest } = await createSignedInRequest({
      email: "admin.edicion@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?modo=editar`,
    });
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.controles@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}`,
    });

    const adminMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(adminRequest, professor.id)),
      professor.id,
    );
    const adminEditMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(adminEditRequest, professor.id)),
      professor.id,
    );
    const auditorMarkup = renderDetailRoute(
      await detailLoader(detailRouteArgs(auditorRequest, professor.id)),
      professor.id,
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

  test("renders the Profesor edit form without inline audit-reason fields or native required attributes", async () => {
    const academy = await createAcademyUser({
      email: "admin.render.rhf.profesores.academia@example.com",
      academyName: "Academia Render RHF",
      contactName: "Rita Render",
      phone: "4545-4545",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Nora",
      lastName: "Render",
    });
    const { request } = await createSignedInRequest({
      email: "admin.render.rhf.profesores@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?modo=editar`,
    });

    const markup = renderDetailRoute(
      await detailLoader(detailRouteArgs(request, professor.id)),
      professor.id,
    );

    expect(markup).toContain('name="firstName"');
    expect(markup).toContain('name="lastName"');
    expect(markup).toContain('noValidate=""');
    expect(markup).not.toContain("required");
    expect(markup).not.toContain("minlength");
    expect(markup).not.toContain('name="correctionReason"');
  });

  test("keeps the detail route in edit mode with submitted values after a correction-reason error", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "admin.dialogo.profesores.academia@example.com",
      academyName: "Academia Dialogo",
      contactName: "Dalia Dialogo",
      phone: "5656-5656",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Mora",
      lastName: "Dialogo",
    });
    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      professorId: professor.id,
      choreographyName: "Memoria Viva",
    });
    const { request } = await createSignedInRequest({
      email: "admin.dialogo.profesores@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?evento=${event.id}&modo=editar`,
    });
    const loaderData = await detailLoader(
      detailRouteArgs(request, professor.id),
    );

    const markup = renderDetailRouteWithActionData({
      loaderData,
      professorId: professor.id,
      actionData: {
        status: "error",
        message: "Revisá los campos marcados.",
        fieldErrors: {
          documentNumber: "Ingresá el número de documento.",
        },
        values: {
          firstName: "Mora",
          lastName: "Dialogo",
          documentType: "",
          documentNumber: "",
        },
      },
    });

    expect(markup).toContain("Guardar");
    expect(markup).toContain("Cancelar");
    expect(markup).toContain('name="firstName"');
    expect(markup).toContain('value="Mora"');
    expect(markup).toContain('value="Dialogo"');
  });

  test("updates a Profesor in explicit edit mode and persists an administrative audit entry", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "admin.mutacion.academia@example.com",
      academyName: "Academia Mutacion",
      contactName: "Nadia Mutacion",
      phone: "5555-5555",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "ana",
      lastName: "perez",
    });
    const { request } = await createSignedInRequest({
      email: "admin.mutacion@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?evento=${event.id}&modo=editar`,
    });

    const result = await detailAction(
      detailActionArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-professor",
          firstName: "  maría del carmen ",
          lastName: " de la cruz ",
          documentType: "dni",
          documentNumber: "12.345-678",
          correctionReason: "",
        }),
        professor.id,
      ),
    );

    expect(result).toMatchObject({
      status: "success",
      message: "Profesor guardado.",
    });
    await expectPersistedProfessor(professor.id, {
      firstName: "María del Carmen",
      lastName: "de la Cruz",
      documentType: "dni",
      documentNumber: "12345678",
      active: true,
    });

    await expect(db.select().from(administrativeAuditEntries)).resolves.toEqual(
      [
        expect.objectContaining({
          entityType: "professor",
          entityId: professor.id,
          eventId: event.id,
          action: "update",
          reason: null,
          beforeValues: {
            firstName: "ana",
            lastName: "perez",
            documentType: null,
            documentNumber: null,
            active: true,
          },
          afterValues: {
            firstName: "María del Carmen",
            lastName: "de la Cruz",
            documentType: "dni",
            documentNumber: "12345678",
            active: true,
          },
        }),
      ],
    );
  });

  test("rejects auditor, judge, and academy mutations", async () => {
    const academy = await createAcademyUser({
      email: "admin.roles.academia@example.com",
      academyName: "Academia Roles",
      contactName: "Rita Roles",
      phone: "7777-7777",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Nora",
      lastName: "Roles",
    });

    for (const role of ["auditor", "judge", "academy"] as const) {
      const { request } = await createSignedInRequest({
        email: `${role}.profesores@example.com`,
        role,
        requestUrl: `http://localhost/administracion/profesores/${professor.id}?modo=editar`,
      });

      await expectThrownResponse(
        detailAction(
          detailActionArgs(
            createPostRequest(
              request.url,
              request.headers.get("cookie") ?? "",
              {
                intent: "update-professor",
                firstName: "Nora",
                lastName: "Roles",
                documentType: "",
                documentNumber: "",
                correctionReason: "",
              },
            ),
            professor.id,
          ),
        ),
        403,
      );
    }
  });

  test("saves a participating Profesor without a correction reason and still writes the audit entry", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "admin.motivo.evento.academia@example.com",
      academyName: "Academia Motivo Evento",
      contactName: "Mara Evento",
      phone: "8888-8888",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Lia",
      lastName: "Participa",
    });
    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      professorId: professor.id,
      choreographyName: "Latido",
    });
    const { request } = await createSignedInRequest({
      email: "admin.motivo.evento@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?evento=${event.id}&modo=editar`,
    });

    const result = await detailAction(
      detailActionArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-professor",
          firstName: "Lia Mariel",
          lastName: "Participa",
          documentType: "",
          documentNumber: "",
        }),
        professor.id,
      ),
    );

    expect(result).toMatchObject({
      status: "success",
      message: "Profesor guardado.",
    });
    await expectPersistedProfessor(professor.id, { firstName: "Lia Mariel" });
    await expect(db.select().from(administrativeAuditEntries)).resolves.toEqual(
      [
        expect.objectContaining({
          entityType: "professor",
          entityId: professor.id,
          action: "update",
          reason: null,
        }),
      ],
    );
  });

  test("saves a Profesor who participated in any Evento without a correction reason and still writes the audit entry", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "admin.motivo.historial.academia@example.com",
      academyName: "Academia Motivo Historial",
      contactName: "Marta Historial",
      phone: "9999-9999",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Lola",
      lastName: "Historial",
    });
    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      professorId: professor.id,
      choreographyName: "Memoria",
    });
    const { request } = await createSignedInRequest({
      email: "admin.motivo.historial@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?modo=editar`,
    });

    const result = await detailAction(
      detailActionArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-professor",
          firstName: "Lola Beatriz",
          lastName: "Historial",
          documentType: "",
          documentNumber: "",
        }),
        professor.id,
      ),
    );

    expect(result).toMatchObject({
      status: "success",
      message: "Profesor guardado.",
    });
    await expectPersistedProfessor(professor.id, { firstName: "Lola Beatriz" });
    await expect(db.select().from(administrativeAuditEntries)).resolves.toEqual(
      [
        expect.objectContaining({
          entityType: "professor",
          entityId: professor.id,
          action: "update",
          reason: null,
        }),
      ],
    );
  });

  test("rejects a duplicate document within the same academy", async () => {
    const academy = await createAcademyUser({
      email: "admin.duplicado.academia@example.com",
      academyName: "Academia Duplicados",
      contactName: "Dora Duplicados",
      phone: "1010-1010",
    });
    await createProfessor({
      academyId: academy.academy.id,
      firstName: "Ana",
      lastName: "Original",
      documentType: "dni",
      documentNumber: "12345678",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Bia",
      lastName: "Nueva",
    });
    const { request } = await createSignedInRequest({
      email: "admin.duplicado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?modo=editar`,
    });

    const result = await detailAction(
      detailActionArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "update-professor",
          firstName: "Bia",
          lastName: "Nueva",
          documentType: "dni",
          documentNumber: "12 345 678",
          correctionReason: "",
        }),
        professor.id,
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un Profesor con ese documento en la academia.",
      },
    });
  });

  test("archives and reactivates a participating Profesor without unlinking coreografias and persists audit entries", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "admin.archivo.academia@example.com",
      academyName: "Academia Archivo Admin",
      contactName: "Ada Archivo",
      phone: "1111-0000",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Rosa",
      lastName: "Archivo",
    });
    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      professorId: professor.id,
      choreographyName: "Persistencia",
    });
    const { request } = await createSignedInRequest({
      email: "admin.archivo@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?evento=${event.id}&modo=editar`,
    });

    const archiveResult = await detailAction(
      detailActionArgs(
        createPostRequest(request.url, request.headers.get("cookie") ?? "", {
          intent: "archive-professor",
          correctionReason: "Corrección manual por soporte.",
        }),
        professor.id,
      ),
    );

    expect(archiveResult).toMatchObject({
      status: "success",
      message: "Profesor archivado.",
    });
    await expectPersistedProfessor(professor.id, { active: false });

    const archivedDetail = await detailLoader(
      detailRouteArgs(request, professor.id),
    );
    expect(archivedDetail.professor.active).toBe(false);
    expect(archivedDetail.professor.participationStatus).toBe("participating");
    expect(archivedDetail.professor.choreographyNames).toEqual([
      "Persistencia",
    ]);

    await expect(
      db
        .select()
        .from(choreographyProfessors)
        .where(eq(choreographyProfessors.professorId, professor.id)),
    ).resolves.toHaveLength(1);

    const reactivateResult = await detailAction(
      detailActionArgs(
        createPostRequest(
          `http://localhost/administracion/profesores/${professor.id}?evento=${event.id}&modo=editar`,
          request.headers.get("cookie") ?? "",
          {
            intent: "reactivate-professor",
            correctionReason: "Reactivación operativa por soporte.",
          },
        ),
        professor.id,
      ),
    );

    expect(reactivateResult).toMatchObject({
      status: "success",
      message: "Profesor reactivado.",
    });
    await expectPersistedProfessor(professor.id, { active: true });
    await expect(
      db
        .select()
        .from(administrativeAuditEntries)
        .orderBy(administrativeAuditEntries.createdAt),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "archive",
        entityId: professor.id,
        reason: "Corrección manual por soporte.",
        beforeValues: expect.objectContaining({ active: true }),
        afterValues: expect.objectContaining({ active: false }),
      }),
      expect.objectContaining({
        action: "reactivate",
        entityId: professor.id,
        reason: "Reactivación operativa por soporte.",
        beforeValues: expect.objectContaining({ active: false }),
        afterValues: expect.objectContaining({ active: true }),
      }),
    ]);
  });
});

function renderRoute(
  loaderData: Parameters<
    typeof AdministracionProfesoresRouteView
  >[0]["loaderData"],
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [buildListInitialEntry(loaderData)],
      },
      createElement(AdministracionProfesoresRouteView, { loaderData }),
    ),
  );
}

function renderDetailRoute(
  loaderData: Parameters<
    typeof AdministracionProfesorDetalleRouteView
  >[0]["loaderData"],
  professorId: string,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [`/administracion/profesores/${professorId}`],
      },
      createElement(AdministracionProfesorDetalleRouteView, { loaderData }),
    ),
  );
}

function renderDetailRouteWithActionData({
  actionData,
  loaderData,
  professorId,
}: Parameters<typeof AdministracionProfesorDetalleRouteView>[0] & {
  professorId: string;
}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [`/administracion/profesores/${professorId}`],
      },
      createElement(AdministracionProfesorDetalleRouteView, {
        actionData,
        loaderData,
      }),
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
    | typeof AdministracionProfesoresRouteView
    | typeof AdministracionProfesorDetalleRouteView;
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
    typeof AdministracionProfesoresRouteView
  >[0]["loaderData"],
) {
  const searchParams = new URLSearchParams();

  if (loaderData.filters.query.length > 0) {
    searchParams.set("busqueda", loaderData.filters.query);
  }

  if (loaderData.filters.nameOrder === "desc") {
    searchParams.set("orden", "nombre:desc");
  }

  const values = getProfessorFilterValues(loaderData);

  if (values.participando) {
    searchParams.set("participando", values.participando);
  }

  if (values.estado) {
    searchParams.set("estado", values.estado);
  }

  if (loaderData.filters.page > 1) {
    searchParams.set("pagina", String(loaderData.filters.page));
  }

  const search = searchParams.toString();

  return `/administracion/profesores${search.length > 0 ? `?${search}` : ""}`;
}

function getProfessorFilterValues(
  loaderData: Parameters<
    typeof AdministracionProfesoresRouteView
  >[0]["loaderData"],
) {
  const values: Record<string, string> = {};
  const statusValue = toAdminProfessorStatusSearchValue(
    loaderData.filters.status,
  );

  if (statusValue === "archivados") {
    values.estado = statusValue;
  }

  const participationValue = toAdminProfessorParticipationSearchValue(
    loaderData.filters.participation,
  );

  if (loaderData.selectedEventId && participationValue !== "todos") {
    values.participando = participationValue;
  }

  return values;
}

function createPostRequest(
  requestUrl: string,
  cookie: string,
  values: Record<string, string>,
) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return new Request(requestUrl, {
    method: "POST",
    body: formData,
    headers: { cookie },
  });
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/profesores",
  };
}

function detailRouteArgs(request: Request, professorId: string) {
  return {
    request,
    params: { professorId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/profesores/:professorId",
  };
}

function detailActionArgs(request: Request, professorId: string) {
  return {
    request,
    params: { professorId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/profesores/:professorId",
  };
}

async function createProfessor(input: {
  academyId: string;
  firstName: string;
  lastName: string;
  active?: boolean;
  documentType?: "dni" | "passport" | "other" | null;
  documentNumber?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const [professor] = await db
    .insert(professors)
    .values({
      academyId: input.academyId,
      firstName: input.firstName,
      lastName: input.lastName,
      active: input.active ?? true,
      documentType: input.documentType ?? null,
      documentNumber: input.documentNumber ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    })
    .returning();

  return professor;
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

async function linkProfessorToEventChoreography(input: {
  eventId: string;
  academyId: string;
  professorId: string;
  choreographyName: string;
}) {
  return createEventChoreographyFixture({
    eventId: input.eventId,
    academyId: input.academyId,
    name: input.choreographyName,
    professorIds: [input.professorId],
  });
}

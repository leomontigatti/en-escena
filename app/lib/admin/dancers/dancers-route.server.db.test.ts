import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  administrativeAuditEntries,
  choreographyDancers,
  choreographies,
  dancers,
  user,
} from "@/db/schema";
import {
  createModality,
  createScheduleBlock,
  createScheduleEntry,
} from "@/lib/events/bases-repository.server";
import {
  toAdminDancerIdentificationSearchValue,
  toAdminDancerParticipationSearchValue,
  toAdminDancerStatusSearchValue,
} from "@/lib/admin/dancers/dancers.shared";
import { auth } from "@/lib/auth/auth.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  AdministracionBailarinesRouteView,
  loader,
} from "@/routes/administracion_.bailarines";
import {
  AdministracionBailarinDetalleRouteView,
  action as detailAction,
  loader as detailLoader,
} from "@/routes/administracion_.bailarines_.$dancerId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/bailarines route", () => {
  test("allows admin access and renders an empty readonly Bailarines list", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.bailarines@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/bailarines",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData.email).toBe("admin.bailarines@example.com");
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
      email: "auditor.bailarines@example.com",
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

  test("filters by participation, identification, and search, paginates server-side, and renders readonly badges", async () => {
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
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&identificacion=todos`,
    });
    const defaultData = await loader(routeArgs(defaultRequest));

    expect(defaultData.filters.participation).toBe("yes");
    expect(defaultData.dancers.map((dancer) => dancer.id)).toEqual([
      participatingDancer.id,
    ]);

    const { request: searchRequest } = await createSignedInRequest({
      email: "admin.search.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&participando=todos&estado=todos&identificacion=incompleta&q=Academia+Sur`,
    });
    const searchData = await loader(routeArgs(searchRequest));
    const searchMarkup = renderRoute(searchData);

    expect(searchData.dancers.map((dancer) => dancer.id)).toEqual([
      identifiedDancer.id,
    ]);
    expect(searchMarkup).toContain("No participando");
    expect(searchMarkup).toContain("Activo");
    expect(searchMarkup).toContain("Sin imágenes");
    expect(searchMarkup).not.toContain("Acciones");
    expect(searchMarkup).toContain(
      `/administracion/bailarines/${identifiedDancer.id}?q=Academia+Sur`,
    );
    expect(searchMarkup).toContain("participando=todos");
    expect(searchMarkup).toContain("estado=todos");
    expect(searchMarkup).toContain("identificacion=incompleta");
    expect(searchMarkup).toContain("q=Academia+Sur");

    const { request: emptySearchRequest } = await createSignedInRequest({
      email: "admin.empty.search.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&participando=todos&identificacion=todos&q=No+existe`,
    });
    const emptySearchData = await loader(routeArgs(emptySearchRequest));
    const emptySearchMarkup = renderRoute(emptySearchData);

    expect(emptySearchData.dancers).toHaveLength(0);
    expect(emptySearchMarkup).toContain('value="No existe"');
    expect(emptySearchMarkup).toContain(
      "No hay Bailarines que coincidan con la búsqueda.",
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
      archivedDancer.id,
    ]);
    expect(archivedMarkup).toContain("Archivado");
    expect(archivedMarkup).toContain("Participando");

    const { request: pageTwoRequest } = await createSignedInRequest({
      email: "admin.pagination.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&participando=todos&identificacion=todos&page=2`,
    });
    const pageTwoData = await loader(routeArgs(pageTwoRequest));
    const pageTwoMarkup = renderRoute(pageTwoData);

    expect(pageTwoData.totalCount).toBe(53);
    expect(pageTwoData.dancers).toHaveLength(3);
    expect(pageTwoData.filters.page).toBe(2);
    expect(pageTwoMarkup).toContain("53 resultados");
    expect(pageTwoMarkup).toContain("3 de 53 registros");
    expect(pageTwoMarkup).toContain('aria-current="page"');
    expect(pageTwoMarkup).toContain(">Anterior<");
    expect(pageTwoMarkup).toContain(
      'href="/administracion/bailarines?participando=todos"',
    );
    expect(pageTwoMarkup).toContain(
      'href="/administracion/bailarines?participando=todos&amp;page=2"',
    );
  });

  test("shows Sin evento badges when there is no Evento activo", async () => {
    const academy = await createAcademyUser({
      email: "sin.evento.dancers@example.com",
      academyName: "Academia Base",
      contactName: "Ceci Base",
      phone: "3333-3333",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Diego",
      lastName: "Base",
      birthDate: "2015-05-05",
    });
    const { request } = await createSignedInRequest({
      email: "admin.no-event.dancers@example.com",
      role: "admin",
      requestUrl:
        "http://localhost/administracion/bailarines?identificacion=todos",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData.selectedEventId).toBeNull();
    expect(loaderData.filters.participation).toBe("all");
    expect(loaderData.dancers.map((item) => item.id)).toEqual([dancer.id]);
    expect(markup).toContain("Sin evento");
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
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&estado=todos&participando=todos&identificacion=todos&page=2&q=Julia`,
    });

    const loaderData = await detailLoader(detailRouteArgs(request, dancer.id));
    const markup = renderDetailRoute(loaderData, dancer.id);

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
    expect(markup).toContain("12/07/2012");
    expect(markup).toContain("Pasaporte AA123456");
    expect(markup).toContain(
      "Faltan imágenes del documento para completar la verificación.",
    );
    expect(markup).toContain("Identificación");
    expect(markup).toContain("Inscripciones");
    expect(markup).not.toContain(`evento=${event.id}`);
    expect(markup).toContain("estado=todos");
    expect(markup).toContain("participando=todos");
    expect(markup).toContain("identificacion=todos");
    expect(markup).toContain("page=2");
    expect(markup).toContain("q=Julia");
    expect(markup).not.toContain("Editar");
    expect(markup).not.toContain("Acciones");
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

    const response = await expectThrownResponse(
      detailAction(
        detailActionArgs(
          createPostRequest(request.url, request.headers.get("cookie") ?? "", {
            intent: "update-dancer",
            firstName: "  maría del carmen ",
            lastName: " de la cruz ",
            birthDate: "2012-05-06",
            documentType: "dni",
            documentNumber: "12.345-678",
            correctionReason: "",
          }),
          dancer.id,
        ),
      ),
      302,
    );

    expect(response.headers.get("location")).toBe(
      `/administracion/bailarines/${dancer.id}?notificacion=bailarin-guardado`,
    );
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({
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
                correctionReason: "",
              },
            ),
            dancer.id,
          ),
        ),
        403,
      );
    }
  });

  test("requires a correction reason when the Bailarín participates in the Evento activo", async () => {
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
          firstName: "Lia",
          lastName: "Participa",
          birthDate: "2012-04-08",
          documentType: "",
          documentNumber: "",
          correctionReason: "",
        }),
        dancer.id,
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        correctionReason:
          "Ingresá un motivo de corrección para guardar este cambio.",
      },
    });
  });

  test("requires a correction reason without Evento activo when the Bailarín participated in any Evento", async () => {
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
          firstName: "Lola",
          lastName: "Historial",
          birthDate: "2011-11-11",
          documentType: "",
          documentNumber: "",
          correctionReason: "",
        }),
        dancer.id,
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        correctionReason:
          "Ingresá un motivo de corrección para guardar este cambio.",
      },
    });
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
          correctionReason: "",
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

  test("warns in edit mode that changing birth date may require recalculating linked coreografias", async () => {
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
    expect(markup).toContain(
      "Si cambiás la fecha de nacimiento, las coreografías vinculadas pueden requerir recalcular categoría desde el flujo de Coreografías.",
    );
  });

  test("updates birth date without recalculating linked coreografias and persists the audit reason", async () => {
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
      birthDate: "2013-05-01",
    });
    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      dancerId: dancer.id,
      choreographyName: "Umbral",
    });
    const [{ ageAtEventStart: beforeAgeAtEventStart }] = await db
      .select({
        ageAtEventStart: choreographyDancers.ageAtEventStart,
      })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.dancerId, dancer.id));
    const { request } = await createSignedInRequest({
      email: "admin.fecha.bailarines@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&modo=editar`,
    });

    await expectThrownResponse(
      detailAction(
        detailActionArgs(
          createPostRequest(request.url, request.headers.get("cookie") ?? "", {
            intent: "update-dancer",
            firstName: "Nina",
            lastName: "Fecha",
            birthDate: "2012-05-01",
            documentType: "",
            documentNumber: "",
            correctionReason: "Corrección manual para alinear el legajo.",
          }),
          dancer.id,
        ),
      ),
      302,
    );

    const [{ ageAtEventStart: afterAgeAtEventStart }] = await db
      .select({
        ageAtEventStart: choreographyDancers.ageAtEventStart,
      })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.dancerId, dancer.id));

    expect(afterAgeAtEventStart).toBe(beforeAgeAtEventStart);
    await expect(
      db
        .select()
        .from(administrativeAuditEntries)
        .orderBy(administrativeAuditEntries.createdAt),
    ).resolves.toEqual([
      expect.objectContaining({
        action: "update",
        entityId: dancer.id,
        reason: "Corrección manual para alinear el legajo.",
        beforeValues: expect.objectContaining({ birthDate: "2013-05-01" }),
        afterValues: expect.objectContaining({ birthDate: "2012-05-01" }),
      }),
    ]);
  });

  test("verifies a pending Bailarín and returns it to pending verification after an administrative edit", async () => {
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
    expect(readOnlyMarkup).toContain("Para verificar");
    expect(readOnlyMarkup).toContain("Verificar identidad");

    const verifyResponse = await expectThrownResponse(
      detailAction(
        detailActionArgs(
          createPostRequest(request.url, request.headers.get("cookie") ?? "", {
            intent: "verify-dancer-identity",
          }),
          dancer.id,
        ),
      ),
      302,
    );

    expect(verifyResponse.headers.get("location")).toBe(
      `/administracion/bailarines/${dancer.id}?notificacion=bailarin-verificado`,
    );
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({
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

    const missingReasonResult = await detailAction(
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
            documentBackImageStorageKey: "dancers/paula-back.jpg",
            correctionReason: "",
          },
        ),
        dancer.id,
      ),
    );

    expect(missingReasonResult).toMatchObject({
      status: "error",
      fieldErrors: {
        correctionReason:
          "Ingresá un motivo de corrección para guardar este cambio.",
      },
    });

    const editResponse = await expectThrownResponse(
      detailAction(
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
              documentBackImageStorageKey: "dancers/paula-back.jpg",
              correctionReason:
                "Reemplazo administrativo del frente del documento.",
            },
          ),
          dancer.id,
        ),
      ),
      302,
    );
    expect(editResponse.headers.get("location")).toBe(
      `/administracion/bailarines/${dancer.id}?notificacion=bailarin-guardado-requiere-verificacion`,
    );

    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({
      documentFrontImageStorageKey: "dancers/paula-front-v2.jpg",
      identityVerifiedAt: null,
    });
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

    const archiveResponse = await expectThrownResponse(
      detailAction(
        detailActionArgs(
          createPostRequest(request.url, request.headers.get("cookie") ?? "", {
            intent: "archive-dancer",
            correctionReason: "Corrección manual por soporte.",
          }),
          dancer.id,
        ),
      ),
      302,
    );

    expect(archiveResponse.headers.get("location")).toBe(
      `/administracion/bailarines/${dancer.id}?notificacion=bailarin-archivado`,
    );
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({ active: false });

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

    await expectThrownResponse(
      detailAction(
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
      ),
      302,
    );

    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({ active: true });
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

function buildListInitialEntry(
  loaderData: Parameters<
    typeof AdministracionBailarinesRouteView
  >[0]["loaderData"],
) {
  const searchParams = new URLSearchParams();

  if (loaderData.filters.query.length > 0) {
    searchParams.set("q", loaderData.filters.query);
  }

  if (
    loaderData.filters.participation !== "yes" ||
    !loaderData.selectedEventId
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
    searchParams.set("page", String(loaderData.filters.page));
  }

  const search = searchParams.toString();

  return `/administracion/bailarines${search.length > 0 ? `?${search}` : ""}`;
}

async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requestUrl: string;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.email,
      password: "password-segura",
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: input.role,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    request: new Request(input.requestUrl, {
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
  };
}

function createRequestCookie(headers: Headers) {
  return headers.get("set-cookie") ?? "";
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

async function createAcademyUser(input: {
  email: string;
  academyName: string;
  contactName: string;
  phone: string;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.email,
      password: "password-segura",
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "academy",
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signUpResult.response.user.id,
      name: input.academyName,
      contactName: input.contactName,
      phone: input.phone,
    })
    .returning();

  return {
    academy,
    userId: signUpResult.response.user.id,
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
  const result = await createEvent({
    name: "Regional 2026",
    registrationStartsAt: new Date("2026-03-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-04-30T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  await activateEvent(result.event.id);

  return result.event;
}

async function linkDancerToEventChoreography(input: {
  eventId: string;
  academyId: string;
  dancerId: string;
  choreographyName: string;
}) {
  const modality = await expectCreated(
    createModality(input.eventId, {
      name: `${input.choreographyName} Mod`,
    }),
  );
  const block = await expectCreated(
    createScheduleBlock(input.eventId, {
      name: `${input.choreographyName} Bloque`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
      modalityIds: [modality.id],
    }),
  );
  const entry = await expectCreated(
    createScheduleEntry(block.id, {
      groupTypes: ["solo"],
      capacity: 10,
    }),
  );
  const [choreography] = await db
    .insert(choreographies)
    .values({
      eventId: input.eventId,
      academyId: input.academyId,
      name: input.choreographyName,
      modalityId: modality.id,
      groupType: "solo",
      categoryCalculationMode: "oldest",
      scheduleEntryId: entry.id,
    })
    .returning();

  await db.insert(choreographyDancers).values({
    choreographyId: choreography.id,
    dancerId: input.dancerId,
    ageAtEventStart: 14,
  });

  return choreography;
}

async function expectCreated<T extends { id: string }>(
  resultPromise: Promise<
    { ok: true; record: T } | { ok: false; error?: string }
  >,
) {
  const result = await resultPromise;

  if (!result.ok) {
    throw new Error(result.error ?? "Expected helper result to be ok.");
  }

  return result.record;
}

async function expectThrownResponse(
  resultPromise: Promise<unknown>,
  expectedStatus: number,
) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);

    const response = error as Response;

    expect(response.status).toBe(expectedStatus);
    return response;
  }

  throw new Error("Expected a Response to be thrown.");
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

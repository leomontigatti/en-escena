import { and, eq } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import {
  EventCategoryDetailRouteView,
  NewEventCategoryRouteView,
  EventCategoriesRouteView,
} from "@/components/admin/events/event-categories";
import {
  EventModalityDetailRouteView,
  EventModalitiesRouteView,
  NewEventModalityRouteView,
} from "@/components/admin/events/event-modalities";
import {
  EventPriceDetailRouteView,
  NewEventPriceRouteView,
  EventPricesRouteView,
} from "@/components/admin/events/event-prices";
import {
  EventSchedulesRouteView,
  EventScheduleDetailRouteView,
  NewEventScheduleRouteView,
} from "@/components/admin/events/event-schedules";
import { db } from "@/db";
import {
  categories,
  events,
  experienceLevels,
  modalities,
  prices,
  schedules,
  scheduleCapacities,
  submodalities,
  user,
} from "@/db/schema";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createSchedule,
  createScheduleCapacity,
  createSubmodality,
} from "@/lib/events/bases-repository.server";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  action,
  type ActionData,
  type EventBasesLoaderData,
  loader,
} from "@/lib/admin/events/bases-route.server";
import { AdministracionRouteView } from "@/routes/administracion";
import { handle as bloquesHorariosHandle } from "@/routes/administracion.cronogramas";
import { handle as bloqueHorarioDetalleHandle } from "@/routes/administracion.cronogramas_.$scheduleId";
import { handle as bloqueHorarioNuevoHandle } from "@/routes/administracion.cronogramas_.nuevo";
import { handle as categoriasHandle } from "@/routes/administracion.categorias";
import { handle as categoriaDetalleHandle } from "@/routes/administracion.categorias_.$categoryId";
import { handle as categoriaNuevaHandle } from "@/routes/administracion.categorias_.nueva";
import { handle as modalidadesHandle } from "@/routes/administracion.modalidades";
import { handle as modalidadDetalleHandle } from "@/routes/administracion.modalidades_.$modalityId";
import { handle as modalidadNuevaHandle } from "@/routes/administracion.modalidades_.nueva";
import { handle as preciosHandle } from "@/routes/administracion.precios";
import { handle as precioDetalleHandle } from "@/routes/administracion.precios_.$priceId";
import { handle as precioNuevoHandle } from "@/routes/administracion.precios_.nuevo";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

let createdEventOffset = 0;

describe.sequential("administracion Bases del evento routes", () => {
  test("requires admin access and renders direct administration section links", async () => {
    const event = await createSavedEvent("Regional 2026");
    await activateEvent(event.id);

    await expectThrownResponse(
      loader(routeArgs(new Request("http://localhost/administracion/eventos"))),
      302,
    );

    const { request } = await createSignedInRequest({
      email: "admin.catalogos@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/eventos",
    });

    const initialData = await loader(routeArgs(request));
    expect(initialData.selectedEventId).toBe(event.id);

    const selectedRequest = await createSignedInRequest({
      email: "admin.catalogos.seleccionado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos?evento=${event.id}`,
    });
    const data = await loader(routeArgs(selectedRequest.request));
    const markup = renderRoute(data, {
      id: "event-bases-overview",
      path: "eventos",
      url: "/administracion/eventos",
      element: createElement("div"),
    });

    expect(data.selectedEventId).toBe(event.id);
    expect(data).not.toHaveProperty("email");
    expect(data).not.toHaveProperty("events");
    expect(markup).toContain("Bases del evento");
    expect(markup).toContain("/administracion/modalidades");
    expect(markup).toContain("/administracion/categorias");
    expect(markup).toContain("/administracion/cronogramas");
    expect(markup).toContain("/administracion/precios");
    expect(markup).not.toContain('name="intent" value="create-modality"');
    expect(markup).toContain("/administracion/eventos");
  });

  test("shows the shared empty state across Bases del evento routes when there is no Evento activo", async () => {
    const request = await createSignedInRequest({
      email: "admin.sin.evento@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/eventos",
    });
    const data = await loader(routeArgs(request.request));

    const modalidadesMarkup = renderModalidadesRoute(data);
    const nuevaModalidadMarkup = renderNuevaModalidadRoute(data);
    const detalleModalidadMarkup = renderModalidadDetalleRoute(
      data,
      "modalidad-inexistente",
    );
    const precioNuevoMarkup = renderPrecioNuevoRoute(data);
    const categoriaNuevaMarkup = renderCategoriaNuevaRoute(data);
    const categoriaDetalleMarkup = renderCategoriaDetalleRoute(
      data,
      "categoria-inexistente",
    );

    expect(modalidadesMarkup).toContain(
      "Elegí un evento activo para editar sus bases",
    );
    expect(nuevaModalidadMarkup).toContain(
      "Elegí un evento activo para editar sus bases",
    );
    expect(detalleModalidadMarkup).toContain(
      "Elegí un evento activo para editar sus bases",
    );
    expect(precioNuevoMarkup).toContain(
      "Elegí un evento activo para editar sus bases",
    );
    expect(categoriaNuevaMarkup).toContain(
      "Elegí un evento activo para editar sus bases",
    );
    expect(categoriaDetalleMarkup).toContain(
      "Elegí un evento activo para editar sus bases",
    );
    expect(modalidadesMarkup).not.toContain(
      'name="intent" value="create-modality"',
    );
    expect(categoriaNuevaMarkup).not.toContain(
      'name="intent" value="create-category"',
    );
    expect(precioNuevoMarkup).not.toContain(
      'name="intent" value="create-price"',
    );
  });

  test("ignores non-active event query and keeps Bases del evento on the Evento activo", async () => {
    const activeEvent = await createSavedEvent("Regional 2026");
    const inactiveEvent = await createSavedEvent("Nacional 2026");
    await activateEvent(activeEvent.id);

    const request = await createSignedInRequest({
      email: "admin.no.activo@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades?evento=${inactiveEvent.id}`,
    });
    const data = await loader(routeArgs(request.request));
    const markup = renderModalidadesRoute(data);

    expect(data.selectedEventId).toBe(activeEvent.id);
    expect(markup).not.toContain("Evento de trabajo");
    expect(markup).toContain("Nueva modalidad");
  });

  test("renders the Modalidades list with Submodalidad badges and dedicated create/detail routes", async () => {
    const event = await createSavedEvent("Regional 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const urbano = await expectCreated(
      createModality(event.id, { name: "Danzas urbanas" }),
    );

    await expectCreated(
      createSubmodality(event.id, {
        modalityId: jazz.id,
        name: "Lyrical",
      }),
    );
    await expectCreated(
      createSubmodality(event.id, {
        modalityId: jazz.id,
        name: "Contemporáneo jazz",
      }),
    );

    const request = await createSignedInRequest({
      email: "admin.lista.modalidades@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades?evento=${event.id}`,
    });
    const data = await loader(routeArgs(request.request));
    const markup = renderModalidadesRoute(data);

    expect(markup).toContain("Nueva modalidad");
    expect(markup).toContain("/administracion/modalidades/nueva");
    expect(markup).toContain("Jazz");
    expect(markup).toContain("Lyrical");
    expect(markup).toContain("Contemporáneo Jazz");
    expect(markup).toContain(`/administracion/modalidades/${jazz.id}`);
    expect(markup).toContain(`/administracion/modalidades/${urbano.id}`);
    expect(markup).not.toContain('name="intent" value="create-modality"');
    expect(markup).not.toContain("Eliminar modalidad");
    expect(markup).toContain("Submodalidades");
  });

  test("creates Modalidades from the dedicated route and loads their detail route", async () => {
    const event = await createSavedEvent("Regional 2026");
    await db
      .update(events)
      .set({ registrationReadinessDirty: false })
      .where(eq(events.id, event.id));
    const modalityRequest = await createSignedInRequest({
      email: "admin.crea.modalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/nueva?evento=${event.id}`,
      body: formData({ intent: "create-modality", name: "Jazz" }),
    });

    const response = await expectThrownResponse(
      action(routeArgs(modalityRequest.request)),
      302,
    );
    const modality = await db.query.modalities.findFirst({
      where: eq(modalities.name, "Jazz"),
    });

    expect(modality).toMatchObject({ eventId: event.id });
    await expect(
      db.query.events.findFirst({
        columns: { registrationReadinessDirty: true },
        where: eq(events.id, event.id),
      }),
    ).resolves.toMatchObject({ registrationReadinessDirty: true });
    expect(response.headers.get("location")).toBe(
      `/administracion/modalidades/${modality?.id}?notificacion=modalidad-guardada`,
    );

    const data = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.detalle.modalidad@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/modalidades/${modality?.id}?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const createMarkup = renderNuevaModalidadRoute(data);
    const detailMarkup = renderModalidadDetalleRoute(data, modality?.id ?? "");

    expect(createMarkup).toContain('aria-label="breadcrumb"');
    expect(createMarkup).toContain("/administracion/modalidades");
    expect(createMarkup).not.toContain("Volver a Modalidades");
    expect(detailMarkup).toContain('aria-label="breadcrumb"');
    expect(detailMarkup).toContain("/administracion/modalidades");
    expect(detailMarkup).not.toContain("Volver a Modalidades");
    expect(detailMarkup).toContain("Guardar");
    expect(detailMarkup).toContain("Agregar submodalidad");
    expect(detailMarkup).toContain("Acciones");
  });

  test("edits Modalidades and manages Submodalidades from the detail route", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    const submodalityRequest = await createSignedInRequest({
      email: "admin.crea.submodalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/${modality.id}?evento=${event.id}`,
      body: formData({
        intent: "create-submodality",
        modalityId: modality.id,
        name: "Jazz funk",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(submodalityRequest.request)),
      302,
    );

    const data = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.lista.catalogos@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/modalidades/${modality.id}?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const detalleMarkup = renderModalidadDetalleRoute(data, modality.id);

    expect(detalleMarkup).toContain("Jazz");
    expect(detalleMarkup).toContain("Jazz Funk");
    expect(detalleMarkup).toContain(`aria-label="Agregar submodalidad"`);
    expect(detalleMarkup).toContain(`aria-label="Quitar submodalidad"`);
    expect(detalleMarkup).toContain('name="submodalities.0.id"');
    expect(detalleMarkup).not.toContain("Elegí una modalidad");
    expect(detalleMarkup).not.toContain(
      'name="intent" value="update-submodality"',
    );

    const editModalityRequest = await createSignedInRequest({
      email: "admin.edita.modalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/${modality.id}?evento=${event.id}`,
      body: formData({
        intent: "update-modality",
        id: modality.id,
        name: "Jazz escénico",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(editModalityRequest.request)),
      302,
    );
    await expect(
      db.query.modalities.findFirst({
        where: eq(modalities.id, modality.id),
      }),
    ).resolves.toMatchObject({ name: "Jazz Escénico" });

    const submodality = await db.query.submodalities.findFirst({
      where: eq(submodalities.name, "Jazz Funk"),
    });
    const editSubmodalityRequest = await createSignedInRequest({
      email: "admin.edita.submodalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/${modality.id}?evento=${event.id}`,
      body: formData({
        intent: "update-submodality",
        id: submodality?.id ?? "",
        modalityId: modality.id,
        name: "Commercial jazz",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(editSubmodalityRequest.request)),
      302,
    );
    await expect(
      db.query.submodalities.findFirst({
        where: eq(submodalities.id, submodality?.id ?? ""),
      }),
    ).resolves.toMatchObject({ name: "Commercial Jazz" });

    const deleteSubmodalityRequest = await createSignedInRequest({
      email: "admin.borra.submodalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/${modality.id}?evento=${event.id}`,
      body: formData({
        intent: "delete-submodality",
        id: submodality?.id ?? "",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(deleteSubmodalityRequest.request)),
      302,
    );
    await expect(
      db.query.submodalities.findFirst({
        where: eq(submodalities.id, submodality?.id ?? ""),
      }),
    ).resolves.toBeUndefined();
  });

  test("saves inline submodalidades through the modalidad form", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const submodality = await expectCreated(
      createSubmodality(event.id, {
        modalityId: modality.id,
        name: "Jazz funk",
      }),
    );

    const updateModalityRequest = await createSignedInRequest({
      email: "admin.inline.submodalidades@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/${modality.id}?evento=${event.id}`,
      body: formData({
        intent: "update-modality",
        id: modality.id,
        name: "Jazz escénico",
        submodalitiesMode: "replace",
        "submodalities.0.id": submodality.id,
        "submodalities.0.name": "Commercial jazz",
        "submodalities.1.name": "Lyrical jazz",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(updateModalityRequest.request)),
      302,
    );

    await expect(
      db.query.modalities.findFirst({
        where: eq(modalities.id, modality.id),
      }),
    ).resolves.toMatchObject({ name: "Jazz Escénico" });

    const savedSubmodalities = await db.query.submodalities.findMany({
      where: eq(submodalities.modalityId, modality.id),
    });

    expect(savedSubmodalities).toHaveLength(2);
    expect(savedSubmodalities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: submodality.id,
          name: "Commercial Jazz",
        }),
        expect.objectContaining({ name: "Lyrical Jazz" }),
      ]),
    );
  });

  test("renders cronogramas as a browse list with ocupación and detail links", async () => {
    const event = await createSavedEvent("Regional 2026");
    const jazz = await createModality(event.id, { name: "Jazz" });
    const urbanas = await createModality(event.id, { name: "Danzas urbanas" });

    if (!jazz.ok || !jazz.record || !urbanas.ok || !urbanas.record) {
      throw new Error("Expected schedule block modalities to be created.");
    }

    const schedule = await expectCreated(
      createSchedule(event.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 24,
        modalityIds: [jazz.record.id, urbanas.record.id],
      }),
    );

    await expectCreated(
      createScheduleCapacity(schedule.id, {
        groupType: "solo",
        capacity: 8,
      }),
    );

    const data = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.lista.bloques.ocupacion@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const markup = renderBloquesHorariosRoute(data);

    expect(markup).toContain("Ocupación");
    expect(markup).toContain("8/24");
    expect(markup).toContain("Sábado mañana");
    expect(markup).toContain("2 de mayo de 2026");
    expect(markup).toContain("09:00");
    expect(markup).toContain("Jazz");
    expect(markup).toContain("Danzas Urbanas");
    expect(markup).toContain(`/administracion/cronogramas/${schedule.id}`);
    expect(markup).toContain("/administracion/cronogramas/nuevo");
    expect(markup).not.toContain('name="intent" value="create-schedule"');
    expect(markup).not.toContain('name="intent" value="delete-schedule"');
    expect(markup).not.toContain(
      'name="intent" value="create-schedule-capacity"',
    );
  });

  test("renders dedicated create and detail routes for cronogramas", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await createModality(event.id, { name: "Jazz" });

    if (!modality.ok || !modality.record) {
      throw new Error("Expected cronograma modality to be created.");
    }

    const schedule = await expectCreated(
      createSchedule(event.id, {
        name: "Domingo tarde",
        scheduledDate: "2026-05-03",
        startTime: "15:00",
        totalCapacity: 18,
        modalityIds: [modality.record.id],
      }),
    );

    const data = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.rutas.bloques@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/cronogramas/nuevo?evento=${event.id}`,
          })
        ).request,
      ),
    );

    const createMarkup = renderNuevoBloqueHorarioRoute(data);
    const detailMarkup = renderBloqueHorarioDetailRoute(data, schedule.id);

    expect(createMarkup).toContain("Nuevo cronograma");
    expect(createMarkup).toContain('name="intent" value="create-schedule"');
    expect(createMarkup).toContain("Dividir cupo");
    expect(detailMarkup).toContain("Editar cronograma");
    expect(detailMarkup).toContain('name="intent" value="update-schedule"');
    expect(detailMarkup).not.toContain("Cupos de cronograma");
    expect(detailMarkup).toContain("Dividir cupo");
  });

  test("creates, edits and deletes Bases del evento through the administration action", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modalityRequest = await createSignedInRequest({
      email: "admin.crea.modalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades?evento=${event.id}`,
      body: formData({ intent: "create-modality", name: "Jazz" }),
    });

    await expectThrownResponse(action(routeArgs(modalityRequest.request)), 302);
    const modality = await db.query.modalities.findFirst({
      where: eq(modalities.name, "Jazz"),
    });

    expect(modality).toMatchObject({ eventId: event.id });

    const submodalityRequest = await createSignedInRequest({
      email: "admin.crea.submodalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades?evento=${event.id}`,
      body: formData({
        intent: "create-submodality",
        modalityId: modality?.id ?? "",
        name: "Jazz funk",
      }),
    });
    const levelRequest = await createSignedInRequest({
      email: "admin.crea.nivel@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias?evento=${event.id}`,
      body: formData({
        intent: "create-experience-level",
        name: "Inicial",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(submodalityRequest.request)),
      302,
    );
    await expectThrownResponse(action(routeArgs(levelRequest.request)), 302);

    const level = await db.query.experienceLevels.findFirst({
      where: eq(experienceLevels.name, "Inicial"),
    });
    const categoryRequest = await createSignedInRequest({
      email: "admin.crea.categoria@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias?evento=${event.id}`,
      body: formData({
        intent: "create-category",
        name: "Infantil",
        minAge: "8",
        maxAge: "12",
        groupTypes: ["solo", "duo"],
        modalityIds: [modality?.id ?? ""],
        experienceLevelIds: [level?.id ?? ""],
      }),
    });

    await expectThrownResponse(action(routeArgs(categoryRequest.request)), 302);

    const data = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.lista.catalogos@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/modalidades?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const modalidadesMarkup = renderModalidadesRoute(data);
    const categoriasMarkup = renderCategoriasRoute(data);

    expect(modalidadesMarkup).toContain("Jazz");
    expect(modalidadesMarkup).toContain("Jazz Funk");
    expect(categoriasMarkup).toContain("Infantil");
    expect(categoriasMarkup).toContain("8 a 12 años");
    expect(categoriasMarkup).toContain("Solo");
    expect(categoriasMarkup).toContain("Dúo");
    expect(categoriasMarkup).toContain("Inicial");

    const editLevelRequest = await createSignedInRequest({
      email: "admin.edita.nivel@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias?evento=${event.id}`,
      body: formData({
        intent: "update-experience-level",
        id: level?.id ?? "",
        name: "Principiante",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(editLevelRequest.request)),
      302,
    );
    await expect(
      db.query.experienceLevels.findFirst({
        where: eq(experienceLevels.id, level?.id ?? ""),
      }),
    ).resolves.toMatchObject({ name: "Principiante" });

    const category = await db.query.categories.findFirst({
      where: eq(categories.name, "Infantil"),
    });
    const editCategoryRequest = await createSignedInRequest({
      email: "admin.edita.categoria@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias?evento=${event.id}`,
      body: formData({
        intent: "update-category",
        id: category?.id ?? "",
        name: "Infantil A",
        minAge: "8",
        maxAge: "12",
        groupTypes: ["solo", "duo"],
        modalityIds: [modality?.id ?? ""],
        experienceLevelIds: [level?.id ?? ""],
      }),
    });

    await expectThrownResponse(
      action(routeArgs(editCategoryRequest.request)),
      302,
    );
    await expect(
      db.query.categories.findFirst({
        where: eq(categories.id, category?.id ?? ""),
      }),
    ).resolves.toMatchObject({ name: "Infantil A" });

    const submodality = await db.query.submodalities.findFirst({
      where: eq(submodalities.name, "Jazz Funk"),
    });
    const deleteSubmodalityRequest = await createSignedInRequest({
      email: "admin.borra.submodalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades?evento=${event.id}`,
      body: formData({
        intent: "delete-submodality",
        id: submodality?.id ?? "",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(deleteSubmodalityRequest.request)),
      302,
    );
    await expect(
      db.query.submodalities.findFirst({
        where: eq(submodalities.id, submodality?.id ?? ""),
      }),
    ).resolves.toBeUndefined();
  });

  test("uses dedicated category routes and can create a new Nivel from the Categoria form", async () => {
    const event = await createSavedEvent("Regional 2026");
    const jazz = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const urbano = await expectCreated(
      createModality(event.id, { name: "Danzas urbanas" }),
    );
    const inicial = await expectCreated(
      createExperienceLevel(event.id, { name: "Inicial" }),
    );

    await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["solo", "grupal"],
        modalityIds: [jazz.id, urbano.id],
        experienceLevelIds: [inicial.id],
      }),
    );

    const request = await createSignedInRequest({
      email: "admin.categorias.rutas@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias?evento=${event.id}`,
    });
    const data = await loader(routeArgs(request.request));

    const listMarkup = renderCategoriasRoute(data);
    expect(listMarkup).toContain("/administracion/categorias/nueva");
    expect(listMarkup).toContain("Buscar categoría por nombre");
    expect(listMarkup).toContain("Juvenil");
    expect(listMarkup).toContain("Solo");
    expect(listMarkup).toContain("Grupal");
    expect(listMarkup).toContain("Inicial");
    expect(listMarkup).toContain("13 a 17 años");
    expect(listMarkup).not.toContain('name="intent" value="create-category"');
    expect(listMarkup).not.toContain("Borrar Categoría");

    const nuevaMarkup = renderCategoriaNuevaRoute(data);
    expect(nuevaMarkup).toContain("Nueva categoría");
    expect(nuevaMarkup).toContain("Guardar");
    expect(nuevaMarkup).toContain("Niveles de experiencia");
    expect(nuevaMarkup).not.toContain(
      "Crear y asociar nuevo nivel de experiencia",
    );

    const duplicateCategoryMarkup = renderCategoriaNuevaRoute(data, {
      status: "error",
      message:
        "Ya existe una categoría con ese rango de edad, tipos de grupo y modalidades.",
      fieldErrors: {},
      scope: {
        intent: "create-category",
      },
      values: {
        name: "Mini avanzado",
        minAge: "8",
        maxAge: "12",
        groupTypes: ["solo"],
        modalityIds: [jazz.id],
        experienceLevelIds: ["Inicial"],
      },
    });

    expect(duplicateCategoryMarkup).not.toContain(
      "Ya existe una categoría con ese rango de edad, tipos de grupo y modalidades.",
    );
    expect(duplicateCategoryMarkup).toContain('value="Mini avanzado"');
    expect(duplicateCategoryMarkup).toContain('value="8"');
    expect(duplicateCategoryMarkup).toContain('value="12"');
    expect(duplicateCategoryMarkup).toContain('name="groupTypes" value="solo"');
    expect(duplicateCategoryMarkup).toContain(
      `name="modalityIds" value="${jazz.id}"`,
    );
    expect(duplicateCategoryMarkup).toContain(
      'name="experienceLevelIds" value="Inicial"',
    );

    const createRequest = await createSignedInRequest({
      email: "admin.categorias.nueva@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias/nueva?evento=${event.id}`,
      body: formData({
        intent: "create-category",
        name: "Mayores",
        minAge: "18",
        maxAge: "99",
        groupTypes: ["duo"],
        modalityIds: [urbano.id],
        experienceLevelIds: ["Elite"],
      }),
    });

    const createResponse = await expectThrownResponse(
      action(routeArgs(createRequest.request)),
      302,
    );
    expect(createResponse.headers.get("location")).toContain(
      "notificacion=categoria-guardada",
    );

    const enumLevel = await db.query.experienceLevels.findFirst({
      where: eq(experienceLevels.name, "Elite"),
    });
    const createdCategory = await db.query.categories.findFirst({
      where: eq(categories.name, "Mayores"),
    });

    expect(enumLevel).toMatchObject({ eventId: event.id });
    expect(createdCategory).toMatchObject({ eventId: event.id });

    const refreshedData = await loader(routeArgs(request.request));
    const category = refreshedData.categories.find(
      (candidate) => candidate.name === "Mayores",
    );

    expect(category?.experienceLevelIds).toEqual(
      expect.arrayContaining([enumLevel?.id ?? ""]),
    );

    const detailMarkup = renderCategoriaDetalleRoute(
      refreshedData,
      createdCategory?.id ?? "",
    );
    expect(detailMarkup).toContain("Editar categoría");
    expect(detailMarkup).toContain("Acciones");
    expect(detailMarkup).toContain("/administracion/categorias");

    const updateRequest = await createSignedInRequest({
      email: "admin.categorias.edita@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias/${createdCategory?.id ?? ""}?evento=${event.id}`,
      body: formData({
        intent: "update-category",
        id: createdCategory?.id ?? "",
        name: "Mayores A",
        minAge: "18",
        maxAge: "99",
        groupTypes: ["duo", "trio"],
        modalityIds: [jazz.id, urbano.id],
        experienceLevelIds: [enumLevel?.id ?? ""],
      }),
    });

    const updateResponse = await expectThrownResponse(
      action(routeArgs(updateRequest.request)),
      302,
    );
    expect(updateResponse.headers.get("location")).toContain(
      "notificacion=categoria-guardada",
    );
    await expect(
      db.query.categories.findFirst({
        where: eq(categories.id, createdCategory?.id ?? ""),
      }),
    ).resolves.toMatchObject({ name: "Mayores A" });

    const deleteRequest = await createSignedInRequest({
      email: "admin.categorias.borra@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias/${createdCategory?.id ?? ""}?evento=${event.id}`,
      body: formData({
        intent: "delete-category",
        id: createdCategory?.id ?? "",
        confirmDeletion: createdCategory?.id ?? "",
      }),
    });

    const deleteResponse = await expectThrownResponse(
      action(routeArgs(deleteRequest.request)),
      302,
    );
    expect(deleteResponse.headers.get("location")).toContain(
      "notificacion=categoria-eliminada",
    );
    await expect(
      db.query.categories.findFirst({
        where: eq(categories.id, createdCategory?.id ?? ""),
      }),
    ).resolves.toBeUndefined();
  });

  test("requires confirmation before deleting a Categoria from its detail route", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const category = await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["solo"],
        modalityIds: [modality.id],
        experienceLevelIds: [],
      }),
    );

    const request = await createSignedInRequest({
      email: "admin.categorias.sin.confirmacion@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias/${category.id}?evento=${event.id}`,
      body: formData({
        intent: "delete-category",
        id: category.id,
      }),
    });

    await expect(action(routeArgs(request.request))).resolves.toEqual({
      status: "error",
      message: "Confirmá el borrado de la categoría antes de continuar.",
      fieldErrors: {
        confirmDelete:
          "Confirmá el borrado de la categoría antes de continuar.",
      },
      scope: {
        intent: "delete-category",
        recordId: category.id,
      },
    });

    await expect(
      db.query.categories.findFirst({
        where: eq(categories.id, category.id),
      }),
    ).resolves.toMatchObject({ id: category.id });
  });

  test("deletes Modalidades only from detail with explicit confirmation", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    const blockedRequest = await createSignedInRequest({
      email: "admin.borra.modalidad.bloqueado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/${modality.id}?evento=${event.id}`,
      body: formData({
        intent: "delete-modality",
        id: modality.id,
      }),
    });

    await expect(action(routeArgs(blockedRequest.request))).resolves.toEqual({
      status: "error",
      message: "Confirmá el borrado de la modalidad.",
      fieldErrors: {},
      scope: {
        intent: "delete-modality",
        recordId: modality.id,
      },
    });

    const confirmedRequest = await createSignedInRequest({
      email: "admin.borra.modalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/${modality.id}?evento=${event.id}`,
      body: formData({
        intent: "delete-modality",
        id: modality.id,
        confirmDeletion: modality.id,
      }),
    });

    const response = await expectThrownResponse(
      action(routeArgs(confirmedRequest.request)),
      302,
    );

    await expect(
      db.query.modalities.findFirst({
        where: eq(modalities.id, modality.id),
      }),
    ).resolves.toBeUndefined();
    expect(response.headers.get("location")).toBe(
      "/administracion/modalidades?notificacion=modalidad-eliminada",
    );
  });

  test("renders the precios list with alcance and dedicated route actions", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    const blockRequest = await createSignedInRequest({
      email: "admin.precio.bloque.lista@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
      body: formData({
        intent: "create-schedule",
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: "24",
        modalityIds: [modality.id],
      }),
    });
    await expectThrownResponse(action(routeArgs(blockRequest.request)), 302);

    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.name, "Sábado mañana"),
    });

    await expectThrownResponse(
      action(
        routeArgs(
          (
            await createSignedInRequest({
              email: "admin.precio.base.lista@example.com",
              role: "admin",
              requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
              body: formData({
                intent: "create-price",
                groupType: "solo",
                amount: "12000",
                paymentDeadline: "2026-05-31",
                scheduleId: "",
              }),
            })
          ).request,
        ),
      ),
      302,
    );

    await expectThrownResponse(
      action(
        routeArgs(
          (
            await createSignedInRequest({
              email: "admin.crea.precio.bloque.lista@example.com",
              role: "admin",
              requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
              body: formData({
                intent: "create-price",
                groupType: "solo",
                amount: "15000",
                paymentDeadline: "2026-05-31",
                scheduleId: schedule?.id ?? "",
              }),
            })
          ).request,
        ),
      ),
      302,
    );

    const request = await createSignedInRequest({
      email: "admin.lista.precios@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
    });
    const data = await loader(routeArgs(request.request));
    const markup = renderPreciosRoute(data);

    expect(markup).toContain("Precio base");
    expect(markup).toContain("Precio por cronograma");
    expect(markup).toContain("Solo - Precio base - hasta 31/5/26");
    expect(markup).toContain("Nuevo precio");
    expect(markup).toContain("/administracion/precios/nuevo");
    expect(markup).not.toContain("Borrar precio");
  });

  test("creates, edits and deletes precios through dedicated create and detail routes", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    const blockRequest = await createSignedInRequest({
      email: "admin.precio.bloque@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
      body: formData({
        intent: "create-schedule",
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: "24",
        modalityIds: [modality.id],
      }),
    });
    await expectThrownResponse(action(routeArgs(blockRequest.request)), 302);

    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.name, "Sábado mañana"),
    });
    const createPriceRequest = await createSignedInRequest({
      email: "admin.crea.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        groupType: "solo",
        amount: "15000",
        paymentDeadline: "2026-05-31",
        scheduleId: schedule?.id ?? "",
      }),
    });

    const createResponse = await expectThrownResponse(
      action(routeArgs(createPriceRequest.request)),
      302,
    );

    const price = await db.query.prices.findFirst({
      where: and(
        eq(prices.groupType, "solo"),
        eq(prices.paymentDeadline, "2026-05-31"),
        eq(prices.scheduleId, schedule?.id ?? ""),
      ),
    });
    expect(createResponse.headers.get("location")).toMatch(
      /\/administracion\/precios\/[^?]+\?notificacion=precio-guardado/,
    );

    const createData = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.form.precios@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const createMarkup = renderPrecioNuevoRoute(createData);
    expect(createMarkup).toContain(
      "El precio base aplica cuando no existe un precio específico para el cronograma.",
    );

    const detailData = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.detalle.precio@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/precios/${price?.id}?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const detailMarkup = renderPrecioDetalleRoute(detailData, price?.id ?? "");

    expect(detailMarkup).toContain("Precio por cronograma");
    expect(detailMarkup).toContain("Sábado mañana");
    expect(detailMarkup).toContain("31/5/26");
    expect(detailMarkup).toContain("Borrar precio");

    const editPriceRequest = await createSignedInRequest({
      email: "admin.edita.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/${price?.id}?evento=${event.id}`,
      body: formData({
        intent: "update-price",
        id: price?.id ?? "",
        groupType: "solo",
        amount: "12000",
        paymentDeadline: "2026-06-30",
        scheduleId: "",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(editPriceRequest.request)),
      302,
    );
    await expect(
      db.query.prices.findFirst({
        where: eq(prices.id, price?.id ?? ""),
      }),
    ).resolves.toMatchObject({
      amount: 12000,
      paymentDeadline: "2026-06-30",
      scheduleId: null,
    });

    const blockedDeleteRequest = await createSignedInRequest({
      email: "admin.borra.precio.bloqueado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/${price?.id}?evento=${event.id}`,
      body: formData({
        intent: "delete-price",
        id: price?.id ?? "",
      }),
    });

    await expect(
      action(routeArgs(blockedDeleteRequest.request)),
    ).resolves.toEqual({
      status: "error",
      message: "Confirmá el borrado del precio.",
      fieldErrors: {},
      scope: {
        intent: "delete-price",
        recordId: price?.id ?? "",
      },
    });

    const deletePriceRequest = await createSignedInRequest({
      email: "admin.borra.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/${price?.id}?evento=${event.id}`,
      body: formData({
        intent: "delete-price",
        id: price?.id ?? "",
        confirmDeletion: price?.id ?? "",
      }),
    });

    const deleteResponse = await expectThrownResponse(
      action(routeArgs(deletePriceRequest.request)),
      302,
    );
    expect(deleteResponse.headers.get("location")).toBe(
      "/administracion/precios?notificacion=precio-eliminado",
    );
  });

  test("creates, edits and deletes Cronogramas through the admin action", async () => {
    const event = await createSavedEvent("Regional 2026");
    await createModality(event.id, { name: "Jazz" });
    await createModality(event.id, { name: "Danzas urbanas" });
    const eventModalities = await db.query.modalities.findMany({
      where: eq(modalities.eventId, event.id),
    });
    const scheduleRequest = await createSignedInRequest({
      email: "admin.crea.bloque@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
      body: formData({
        intent: "create-schedule",
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: "24",
        modalityIds: eventModalities.map((modality) => modality.id),
      }),
    });

    const createScheduleResponse = await expectThrownResponse(
      action(routeArgs(scheduleRequest.request)),
      302,
    );
    expect(createScheduleResponse.headers.get("location")).toMatch(
      /\/administracion\/cronogramas\/[^?]+\?notificacion=cronograma-guardado/,
    );

    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.name, "Sábado mañana"),
    });
    expect(schedule).toMatchObject({
      eventId: event.id,
      scheduledDate: "2026-05-02",
      startTime: "09:00",
      totalCapacity: 24,
    });

    const data = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.lista.bloques@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const markup = renderBloquesHorariosRoute(data);

    expect(markup).toContain("Sábado mañana");
    expect(markup).toContain("2 de mayo de 2026");
    expect(markup).toContain("09:00");
    expect(markup).toContain("0/24");
    expect(markup).toContain("Jazz");
    expect(markup).toContain("Danzas Urbanas");

    const urbanas = eventModalities.find(
      (modality) => modality.name === "Danzas Urbanas",
    );
    const editScheduleRequest = await createSignedInRequest({
      email: "admin.edita.bloque@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
      body: formData({
        intent: "update-schedule",
        id: schedule?.id ?? "",
        name: "Sábado tarde",
        scheduledDate: "2026-05-02",
        startTime: "14:30",
        totalCapacity: "18",
        modalityIds: [urbanas?.id ?? ""],
      }),
    });

    const updateScheduleResponse = await expectThrownResponse(
      action(routeArgs(editScheduleRequest.request)),
      302,
    );
    expect(updateScheduleResponse.headers.get("location")).toContain(
      "notificacion=cronograma-guardado",
    );
    await expect(
      db.query.schedules.findFirst({
        where: eq(schedules.id, schedule?.id ?? ""),
      }),
    ).resolves.toMatchObject({
      name: "Sábado tarde",
      startTime: "14:30",
      totalCapacity: 18,
    });

    const deleteScheduleRequest = await createSignedInRequest({
      email: "admin.borra.bloque@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
      body: formData({
        intent: "delete-schedule",
        id: schedule?.id ?? "",
      }),
    });

    const deleteScheduleResponse = await expectThrownResponse(
      action(routeArgs(deleteScheduleRequest.request)),
      302,
    );
    expect(deleteScheduleResponse.headers.get("location")).toBe(
      "/administracion/cronogramas?notificacion=cronograma-eliminado",
    );
    await expect(
      db.query.schedules.findFirst({
        where: eq(schedules.id, schedule?.id ?? ""),
      }),
    ).resolves.toBeUndefined();
  });

  test("creates, edits and deletes precios through the admin action", async () => {
    const event = await createSavedEvent("Regional 2026");
    await createModality(event.id, { name: "Jazz" });
    const modality = await db.query.modalities.findFirst({
      where: eq(modalities.eventId, event.id),
    });
    const blockRequest = await createSignedInRequest({
      email: "admin.precio.bloque@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
      body: formData({
        intent: "create-schedule",
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: "24",
        modalityIds: [modality?.id ?? ""],
      }),
    });
    await expectThrownResponse(action(routeArgs(blockRequest.request)), 302);

    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.name, "Sábado mañana"),
    });
    const createPriceRequest = await createSignedInRequest({
      email: "admin.crea.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        groupType: "solo",
        amount: "15000",
        paymentDeadline: "2026-05-31",
        scheduleId: schedule?.id ?? "",
      }),
    });

    const createPriceResponse = await expectThrownResponse(
      action(routeArgs(createPriceRequest.request)),
      302,
    );
    expect(createPriceResponse.headers.get("location")).toMatch(
      /\/administracion\/precios\/[^?]+\?notificacion=precio-guardado/,
    );

    const price = await db.query.prices.findFirst({
      where: and(
        eq(prices.groupType, "solo"),
        eq(prices.paymentDeadline, "2026-05-31"),
        eq(prices.scheduleId, schedule?.id ?? ""),
      ),
    });
    expect(price).toMatchObject({
      eventId: event.id,
      groupType: "solo",
      amount: 15000,
      paymentDeadline: "2026-05-31",
      scheduleId: schedule?.id,
    });

    const data = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.lista.precios@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const markup = renderPreciosRoute(data);

    expect(markup).toContain("Solo - Sábado mañana - hasta 31/5/26");
    expect(markup).toContain("Solo");
    expect(markup).toContain("$15000");
    expect(markup).toContain("Sábado mañana");

    const editPriceRequest = await createSignedInRequest({
      email: "admin.edita.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      body: formData({
        intent: "update-price",
        id: price?.id ?? "",
        groupType: "solo",
        amount: "12000",
        paymentDeadline: "2026-06-30",
        scheduleId: "",
      }),
    });

    const updatePriceResponse = await expectThrownResponse(
      action(routeArgs(editPriceRequest.request)),
      302,
    );
    expect(updatePriceResponse.headers.get("location")).toContain(
      "notificacion=precio-guardado",
    );
    await expect(
      db.query.prices.findFirst({
        where: eq(prices.id, price?.id ?? ""),
      }),
    ).resolves.toMatchObject({
      amount: 12000,
      paymentDeadline: "2026-06-30",
      scheduleId: null,
    });

    const deletePriceRequest = await createSignedInRequest({
      email: "admin.borra.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      body: formData({
        intent: "delete-price",
        id: price?.id ?? "",
      }),
    });

    const deletePriceResponse = await expectThrownResponse(
      action(routeArgs(deletePriceRequest.request)),
      302,
    );
    expect(deletePriceResponse.headers.get("location")).toBe(
      "/administracion/precios?notificacion=precio-eliminado",
    );
    await expect(
      db.query.prices.findFirst({
        where: eq(prices.id, price?.id ?? ""),
      }),
    ).resolves.toBeUndefined();
  });

  test("creates, edits and deletes cupos de cronograma inside cronogramas through the admin action", async () => {
    const event = await createSavedEvent("Regional 2026");
    await createModality(event.id, { name: "Jazz" });
    const [modality] = await db.query.modalities.findMany({
      where: eq(modalities.eventId, event.id),
    });
    const scheduleRequest = await createSignedInRequest({
      email: "admin.crea.bloque.cupo-cronograma@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas/nuevo?evento=${event.id}`,
      body: formData({
        intent: "create-schedule",
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: "12",
        modalityIds: [modality?.id ?? ""],
      }),
    });

    await expectThrownResponse(action(routeArgs(scheduleRequest.request)), 302);

    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.name, "Sábado mañana"),
    });
    const createScheduleCapacityRequest = await createSignedInRequest({
      email: "admin.crea.cupo-cronograma@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas/${schedule?.id}?evento=${event.id}`,
      body: formData({
        intent: "create-schedule-capacity",
        scheduleId: schedule?.id ?? "",
        groupType: "solo",
        capacity: "8",
      }),
    });

    const createScheduleCapacityResponse = await expectThrownResponse(
      action(routeArgs(createScheduleCapacityRequest.request)),
      302,
    );
    expect(createScheduleCapacityResponse.headers.get("location")).toContain(
      "notificacion=cupo-cronograma-guardado",
    );

    const scheduleCapacity = await db.query.scheduleCapacities.findFirst({
      where: eq(scheduleCapacities.scheduleId, schedule?.id ?? ""),
    });
    expect(scheduleCapacity).toMatchObject({
      groupType: "solo",
      capacity: 8,
    });

    const data = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.lista.cupos-cronograma@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/cronogramas/${schedule?.id}?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const markup = renderBloqueHorarioDetailRoute(data, schedule?.id ?? "");

    expect(markup).not.toContain("Cupos de cronograma");
    expect(markup).toContain('name="scheduleCapacities.0.groupType"');
    expect(markup).toContain('name="scheduleCapacities.0.capacity"');

    const editScheduleCapacityRequest = await createSignedInRequest({
      email: "admin.edita.cupo-cronograma@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas/${schedule?.id}?evento=${event.id}`,
      body: formData({
        intent: "update-schedule-capacity",
        id: scheduleCapacity?.id ?? "",
        groupType: "trio",
        capacity: "4",
      }),
    });

    const updateScheduleCapacityResponse = await expectThrownResponse(
      action(routeArgs(editScheduleCapacityRequest.request)),
      302,
    );
    expect(updateScheduleCapacityResponse.headers.get("location")).toContain(
      "notificacion=cupo-cronograma-guardado",
    );
    await expect(
      db.query.scheduleCapacities.findFirst({
        where: eq(scheduleCapacities.id, scheduleCapacity?.id ?? ""),
      }),
    ).resolves.toMatchObject({
      groupType: "trio",
      capacity: 4,
    });

    const deleteScheduleCapacityRequest = await createSignedInRequest({
      email: "admin.borra.cupo-cronograma@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas/${schedule?.id}?evento=${event.id}`,
      body: formData({
        intent: "delete-schedule-capacity",
        id: scheduleCapacity?.id ?? "",
      }),
    });

    const deleteScheduleCapacityResponse = await expectThrownResponse(
      action(routeArgs(deleteScheduleCapacityRequest.request)),
      302,
    );
    expect(deleteScheduleCapacityResponse.headers.get("location")).toContain(
      "notificacion=cupo-cronograma-eliminado",
    );
    await expect(
      db.query.scheduleCapacities.findFirst({
        where: eq(scheduleCapacities.id, scheduleCapacity?.id ?? ""),
      }),
    ).resolves.toBeUndefined();
  });

  test("saves inline cupos de cronograma through the cronograma form", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const createScheduleRequest = await createSignedInRequest({
      email: "admin.inline.cupos-cronograma@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas/nuevo?evento=${event.id}`,
      body: formData({
        intent: "create-schedule",
        name: "Domingo tarde",
        scheduledDate: "2026-05-03",
        startTime: "15:00",
        totalCapacity: "12",
        modalityIds: [modality.id],
        "scheduleCapacities.0.groupType": "solo",
        "scheduleCapacities.0.capacity": "5",
        "scheduleCapacities.1.groupType": "grupal",
        "scheduleCapacities.1.capacity": "7",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(createScheduleRequest.request)),
      302,
    );

    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.name, "Domingo tarde"),
    });
    const createdEntries = await db.query.scheduleCapacities.findMany({
      where: eq(scheduleCapacities.scheduleId, schedule?.id ?? ""),
    });
    const soloEntry = createdEntries.find(
      (entry) => entry.groupType === "solo",
    );

    expect(createdEntries).toHaveLength(2);
    expect(createdEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ groupType: "solo", capacity: 5 }),
        expect.objectContaining({ groupType: "grupal", capacity: 7 }),
      ]),
    );

    const updateScheduleRequest = await createSignedInRequest({
      email: "admin.inline.cupos-cronograma.edita@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas/${schedule?.id}?evento=${event.id}`,
      body: formData({
        intent: "update-schedule",
        id: schedule?.id ?? "",
        name: "Domingo tarde",
        scheduledDate: "2026-05-03",
        startTime: "15:00",
        totalCapacity: "12",
        modalityIds: [modality.id],
        "scheduleCapacities.0.id": soloEntry?.id ?? "",
        "scheduleCapacities.0.groupType": "duo",
        "scheduleCapacities.0.capacity": "3",
        "scheduleCapacities.1.groupType": "trio",
        "scheduleCapacities.1.capacity": "4",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(updateScheduleRequest.request)),
      302,
    );

    const updatedEntries = await db.query.scheduleCapacities.findMany({
      where: eq(scheduleCapacities.scheduleId, schedule?.id ?? ""),
    });

    expect(updatedEntries).toHaveLength(2);
    expect(updatedEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: soloEntry?.id, groupType: "duo" }),
        expect.objectContaining({ groupType: "trio", capacity: 4 }),
      ]),
    );
    expect(updatedEntries.some((entry) => entry.groupType === "grupal")).toBe(
      false,
    );
  });

  test("returns Spanish validation errors from Bases del evento actions", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await createModality(event.id, { name: "Jazz" });
    await createExperienceLevel(event.id, { name: "Inicial" });
    const duplicateRequest = await createSignedInRequest({
      email: "admin.duplicado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades?evento=${event.id}`,
      body: formData({ intent: "create-modality", name: " jazz " }),
    });

    await expect(action(routeArgs(duplicateRequest.request))).resolves.toEqual({
      status: "error",
      message: "Ya existe una modalidad con ese nombre en este evento.",
      fieldErrors: { name: "Usá un nombre distinto para la modalidad." },
      scope: {
        intent: "create-modality",
      },
      values: {
        name: " jazz ",
      },
    });

    const invalidCategoryRequest = await createSignedInRequest({
      email: "admin.categoria.invalida@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias?evento=${event.id}`,
      body: formData({
        intent: "create-category",
        name: "Infantil",
        minAge: "12",
        maxAge: "8",
        groupTypes: ["solo"],
        modalityIds:
          modality.ok && modality.record ? [modality.record.id] : [""],
      }),
    });

    await expect(
      action(routeArgs(invalidCategoryRequest.request)),
    ).resolves.toEqual({
      status: "error",
      message: "Revisá las edades de la categoría.",
      fieldErrors: {
        ageRange: "La edad máxima debe ser mayor o igual a la mínima.",
      },
      scope: {
        intent: "create-category",
      },
      values: {
        name: "Infantil",
        minAge: "12",
        maxAge: "8",
        groupTypes: ["solo"],
        modalityIds:
          modality.ok && modality.record ? [modality.record.id] : [""],
        experienceLevelIds: [],
      },
    });

    if (!modality.ok) {
      throw new Error("Expected modality creation to succeed.");
    }

    await expectCreated(
      createCategory(event.id, {
        name: "Mini",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [modality.record.id],
        experienceLevelIds: [],
      }),
    );

    const duplicateCategoryValues = {
      name: "Mini avanzado",
      minAge: "8",
      maxAge: "12",
      groupTypes: ["solo"],
      modalityIds: [modality.record.id],
      experienceLevelIds: ["Elite"],
    };
    const duplicateCategoryRequest = await createSignedInRequest({
      email: "admin.categoria.duplicada@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias/nueva?evento=${event.id}`,
      body: formData({
        intent: "create-category",
        ...duplicateCategoryValues,
      }),
    });

    await expect(
      action(routeArgs(duplicateCategoryRequest.request)),
    ).resolves.toEqual({
      status: "error",
      message:
        "Ya existe una categoría con ese rango de edad, tipos de grupo y modalidades.",
      fieldErrors: {},
      scope: {
        intent: "create-category",
      },
      values: duplicateCategoryValues,
    });

    const createPriceRequest = await createSignedInRequest({
      email: "admin.precio.base@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        groupType: "solo",
        amount: "12000",
        paymentDeadline: "2026-05-31",
        scheduleId: "",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(createPriceRequest.request)),
      302,
    );

    const duplicatePriceRequest = await createSignedInRequest({
      email: "admin.precio.duplicado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        groupType: "solo",
        amount: "13000",
        paymentDeadline: "2026-05-31",
        scheduleId: "",
      }),
    });

    await expect(
      action(routeArgs(duplicatePriceRequest.request)),
    ).resolves.toEqual({
      status: "error",
      message: "Ya existe un precio general para ese tipo de grupo.",
      fieldErrors: {
        groupType: "Revisá el tipo de grupo del precio.",
      },
      scope: {
        intent: "create-price",
      },
      values: {
        name: "",
        isSpecialPrice: "",
        groupType: "solo",
        amount: "13000",
        paymentDeadline: "2026-05-31",
        scheduleId: "",
      },
    });

    const requiredPriceRequest = await createSignedInRequest({
      email: "admin.precio.requerido@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        name: "",
        groupType: "",
        amount: "",
        paymentDeadline: "",
        scheduleId: "",
      }),
    });

    await expect(
      action(routeArgs(requiredPriceRequest.request)),
    ).resolves.toEqual({
      status: "error",
      message: "Revisá los datos del precio.",
      fieldErrors: {
        groupType: "Este campo es obligatorio.",
        amount: "Este campo es obligatorio.",
        paymentDeadline: "Este campo es obligatorio.",
      },
      scope: {
        intent: "create-price",
      },
      values: {
        name: "",
        isSpecialPrice: "",
        groupType: "",
        amount: "",
        paymentDeadline: "",
        scheduleId: "",
      },
    });

    const requiredScheduleRequest = await createSignedInRequest({
      email: "admin.bloque.requerido@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas/nuevo?evento=${event.id}`,
      body: formData({
        intent: "create-schedule",
        name: "",
        scheduledDate: "",
        startTime: "",
        totalCapacity: "",
        modalityIds: [],
      }),
    });

    await expect(
      action(routeArgs(requiredScheduleRequest.request)),
    ).resolves.toEqual({
      status: "error",
      message: "Revisá los datos del cronograma.",
      fieldErrors: {
        name: "Este campo es obligatorio.",
        scheduledDate: "Este campo es obligatorio.",
        startTime: "Este campo es obligatorio.",
        totalCapacity: "Este campo es obligatorio.",
        modalityIds: "Este campo es obligatorio.",
      },
      scope: {
        intent: "create-schedule",
      },
      values: {
        name: "",
        scheduledDate: "",
        startTime: "",
        totalCapacity: "",
        modalityIds: [],
        scheduleCapacities: [],
      },
    });

    const createdBlock = await expectCreated(
      createSchedule(event.id, {
        name: "Domingo tarde",
        scheduledDate: "2026-05-03",
        startTime: "15:00",
        totalCapacity: 10,
        modalityIds: modality.ok && modality.record ? [modality.record.id] : [],
      }),
    );

    const requiredScheduleCapacityRequest = await createSignedInRequest({
      email: "admin.cupo-cronograma.requerido@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/cronogramas/${createdBlock.id}?evento=${event.id}`,
      body: formData({
        intent: "create-schedule-capacity",
        scheduleId: createdBlock.id,
        groupType: "",
        capacity: "",
      }),
    });

    await expect(
      action(routeArgs(requiredScheduleCapacityRequest.request)),
    ).resolves.toEqual({
      status: "error",
      message: "Revisá los datos del cupo de cronograma.",
      fieldErrors: {
        groupType: "Este campo es obligatorio.",
        capacity: "Este campo es obligatorio.",
      },
      scope: {
        intent: "create-schedule-capacity",
        parentRecordId: createdBlock.id,
      },
      values: {
        groupType: "",
        capacity: "",
      },
    });
  });

  test("routes modalidad and submodalidad field errors to the correct form", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const request = await createSignedInRequest({
      email: "admin.errores.modalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/${modality.id}?evento=${event.id}`,
    });
    const data = await loader(routeArgs(request.request));

    const createMarkup = renderNuevaModalidadRoute(data, {
      status: "error",
      message: "Ya existe una modalidad con ese nombre en este evento.",
      fieldErrors: { name: "Usá un nombre distinto para la modalidad." },
      scope: {
        intent: "create-modality",
      },
    });
    const detailMarkup = renderModalidadDetalleRoute(data, modality.id, {
      status: "error",
      message: "Ingresá el nombre de la submodalidad.",
      fieldErrors: {
        "submodalities.0.name": "Ingresá el nombre de la submodalidad.",
      },
      scope: {
        intent: "update-modality",
        recordId: modality.id,
      },
      values: {
        name: "Jazz",
        submodalities: [{ name: "" }],
      },
    });

    expect(createMarkup).not.toContain(
      "Ya existe una modalidad con ese nombre en este evento.",
    );
    expect(createMarkup).toContain("Usá un nombre distinto para la modalidad.");
    expect(detailMarkup).not.toContain(
      "Usá un nombre distinto para la modalidad.",
    );
    expect(detailMarkup).toContain("Ingresá el nombre de la submodalidad.");
  });

  test("routes cupo de cronograma field errors to the submitted cupo de cronograma form only", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const schedule = await expectCreated(
      createSchedule(event.id, {
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 24,
        modalityIds: [modality.id],
      }),
    );
    const request = await createSignedInRequest({
      email: "admin.errores.precios.bloques@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
    });
    const data = await loader(routeArgs(request.request));
    const scheduleCapacity = await expectCreated(
      createScheduleCapacity(schedule.id, {
        groupType: "solo",
        capacity: 6,
      }),
    );
    const refreshedData = await loader(routeArgs(request.request));

    const priceMarkup = renderRoute(data, {
      id: "price-new-error",
      path: "precios/nuevo",
      url: "/administracion/precios/nuevo",
      handle: precioNuevoHandle,
      element: createElement(NewEventPriceRouteView, {
        loaderData: data,
        actionData: {
          status: "error",
          message: "Revisá los datos del precio.",
          fieldErrors: { amount: "Este campo es obligatorio." },
          scope: {
            intent: "create-price",
          },
        },
      }),
    });
    const scheduleMarkup = renderRoute(data, {
      id: "schedule-detail-error",
      path: "cronogramas/:scheduleId",
      url: `/administracion/cronogramas/${schedule.id}`,
      handle: bloqueHorarioDetalleHandle,
      element: createElement(EventScheduleDetailRouteView, {
        loaderData: data,
        scheduleId: schedule.id,
        actionData: {
          status: "error",
          message: "Revisá los datos del cupo de cronograma.",
          fieldErrors: {
            "scheduleCapacities.0.capacity": "Este campo es obligatorio.",
          },
          scope: {
            intent: "update-schedule",
            recordId: schedule.id,
          },
        },
      }),
    });
    const updateScheduleMarkup = renderBloqueHorarioDetailRoute(
      refreshedData,
      schedule.id,
      {
        status: "error",
        message: "Revisá los datos del cupo de cronograma.",
        fieldErrors: {
          "scheduleCapacities.0.capacity": "Ajustá el cupo.",
        },
        scope: {
          intent: "update-schedule",
          recordId: schedule.id,
        },
      },
    );

    expect(priceMarkup).not.toContain("Revisá los datos del precio.");
    expect(scheduleMarkup).not.toContain(
      "Revisá los datos del cupo de cronograma.",
    );
    expect(scheduleMarkup).not.toContain("Este campo es obligatorio.");
    expect(updateScheduleMarkup).toContain("Ajustá el cupo.");
    expect(updateScheduleMarkup).not.toContain("Este campo es obligatorio.");
  });
});

async function createSavedEvent(name: string) {
  const eventOffset = createdEventOffset++;
  const registrationStartsAt = new Date(
    Date.UTC(2030 + eventOffset, 2, 1, 12, 0, 0),
  );
  const registrationEndsAt = new Date(
    Date.UTC(2030 + eventOffset, 3, 30, 12, 0, 0),
  );
  const startsAt = new Date(Date.UTC(2030 + eventOffset, 4, 1, 12, 0, 0));
  const endsAt = new Date(Date.UTC(2030 + eventOffset, 4, 3, 12, 0, 0));
  const result = await createEvent({
    name,
    registrationStartsAt,
    registrationEndsAt,
    startsAt,
    endsAt,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  await activateEvent(result.event.id);

  return result.event;
}

async function expectCreated(
  resultPromise: Promise<{
    ok: boolean;
    record?: { id: string };
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected Bases del evento creation to succeed.");
  }

  return result.record;
}

function renderRoute(
  loaderData: EventBasesLoaderData,
  childRoute: AdminChildRouteFixture,
) {
  const RoutesStub = createRoutesStub([
    {
      id: "admin",
      path: "/administracion",
      Component: AdministracionRouteView,
      children: [
        {
          id: childRoute.id,
          path: childRoute.path,
          Component: () => childRoute.element,
          handle: childRoute.handle,
        },
      ],
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: [childRoute.url],
      hydrationData: {
        loaderData: {
          admin: adminLoaderData(loaderData),
          [childRoute.id]: loaderData,
        },
      },
    }),
  );
}

type AdminChildRouteFixture = {
  element: ReactElement;
  handle?: unknown;
  id: string;
  path: string;
  url: string;
};

function adminLoaderData(loaderData: EventBasesLoaderData) {
  return {
    email: "admin@example.com",
    events: [{ active: true, id: "event_1", name: "Evento 2026" }],
    selectedEventId: loaderData.selectedEventId,
  };
}

function renderCategoriasRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "categories",
    path: "categorias",
    url: "/administracion/categorias",
    handle: categoriasHandle,
    element: createElement(EventCategoriesRouteView, { loaderData }),
  });
}

function renderCategoriaNuevaRoute(
  loaderData: EventBasesLoaderData,
  actionData?: ActionData,
) {
  return renderRoute(loaderData, {
    id: "category-new",
    path: "categorias/nueva",
    url: "/administracion/categorias/nueva",
    handle: categoriaNuevaHandle,
    element: createElement(NewEventCategoryRouteView, {
      loaderData,
      actionData,
    }),
  });
}

function renderCategoriaDetalleRoute(
  loaderData: EventBasesLoaderData,
  categoryId: string,
) {
  return renderRoute(loaderData, {
    id: "category-detail",
    path: "categorias/:categoryId",
    url: `/administracion/categorias/${categoryId}`,
    handle: categoriaDetalleHandle,
    element: createElement(EventCategoryDetailRouteView, {
      loaderData,
      categoryId,
    }),
  });
}

function renderModalidadesRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "modalities",
    path: "modalidades",
    url: "/administracion/modalidades",
    handle: modalidadesHandle,
    element: createElement(EventModalitiesRouteView, {
      loaderData,
    }),
  });
}

function renderNuevaModalidadRoute(
  loaderData: EventBasesLoaderData,
  actionData?: ActionData,
) {
  return renderRoute(loaderData, {
    id: "modality-new",
    path: "modalidades/nueva",
    url: "/administracion/modalidades/nueva",
    handle: modalidadNuevaHandle,
    element: createElement(NewEventModalityRouteView, {
      loaderData,
      actionData,
    }),
  });
}

function renderModalidadDetalleRoute(
  loaderData: EventBasesLoaderData,
  modalityId: string,
  actionData?: ActionData,
) {
  return renderRoute(loaderData, {
    id: "modality-detail",
    path: "modalidades/:modalityId",
    url: `/administracion/modalidades/${modalityId}`,
    handle: modalidadDetalleHandle,
    element: createElement(EventModalityDetailRouteView, {
      loaderData,
      modalityId,
      actionData,
    }),
  });
}

function renderBloquesHorariosRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "schedules",
    path: "cronogramas",
    url: "/administracion/cronogramas",
    handle: bloquesHorariosHandle,
    element: createElement(EventSchedulesRouteView, {
      loaderData,
    }),
  });
}

function renderNuevoBloqueHorarioRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "schedule-new",
    path: "cronogramas/nuevo",
    url: "/administracion/cronogramas/nuevo",
    handle: bloqueHorarioNuevoHandle,
    element: createElement(NewEventScheduleRouteView, {
      loaderData,
    }),
  });
}

function renderBloqueHorarioDetailRoute(
  loaderData: EventBasesLoaderData,
  scheduleId: string,
  actionData?: ActionData,
) {
  return renderRoute(loaderData, {
    id: "schedule-detail",
    path: "cronogramas/:scheduleId",
    url: `/administracion/cronogramas/${scheduleId}`,
    handle: bloqueHorarioDetalleHandle,
    element: createElement(EventScheduleDetailRouteView, {
      loaderData,
      scheduleId,
      actionData,
    }),
  });
}

function renderPreciosRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "prices",
    path: "precios",
    url: "/administracion/precios",
    handle: preciosHandle,
    element: createElement(EventPricesRouteView, { loaderData }),
  });
}

function renderPrecioNuevoRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "price-new",
    path: "precios/nuevo",
    url: "/administracion/precios/nuevo",
    handle: precioNuevoHandle,
    element: createElement(NewEventPriceRouteView, { loaderData }),
  });
}

function renderPrecioDetalleRoute(
  loaderData: EventBasesLoaderData,
  priceId: string,
) {
  return renderRoute(loaderData, {
    id: "price-detail",
    path: "precios/:priceId",
    url: `/administracion/precios/${priceId}`,
    handle: precioDetalleHandle,
    element: createElement(EventPriceDetailRouteView, {
      loaderData,
      priceId,
    }),
  });
}

async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requestUrl: string;
  body?: FormData;
}) {
  const signUpResult = await createLocalAccessUser({
    email: input.email,
    name: input.email,
    password: "password-segura",
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
      method: input.body ? "POST" : "GET",
      body: input.body,
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
  };
}

function formData(input: Record<string, string | string[]>) {
  const form = new FormData();

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        form.append(key, item);
      }
      continue;
    }

    form.set(key, value);
  }

  return form;
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/eventos",
  };
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return setCookie.split(";")[0] ?? "";
}

async function expectThrownResponse(
  resultPromise: Promise<unknown>,
  status: number,
) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(status);
    return error as Response;
  }

  throw new Error("Expected a response to be thrown.");
}

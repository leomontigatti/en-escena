import { and, eq } from "drizzle-orm";
import { createElement } from "react";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  categories,
  events,
  experienceLevels,
  modalities,
  prices,
  schedules,
  submodalities,
} from "@/db/schema";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createSchedule,
  createSubmodality,
} from "@/lib/events/bases-repository.server";
import { loader } from "@/lib/admin/events/bases-route.server";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  action,
  createSavedEvent,
  createSignedInRequest,
  expectCreated,
  expectThrownResponse,
  formData,
  renderCategoriasRoute,
  renderCategoriaDetalleRoute,
  renderCategoriaNuevaRoute,
  renderModalidadesRoute,
  renderModalidadDetalleRoute,
  renderNuevaModalidadRoute,
  renderPrecioDetalleRoute,
  renderPrecioNuevoRoute,
  renderPreciosRoute,
  renderRoute,
  routeArgs,
} from "./bases-route.test-helpers";

installDatabaseTestHooks();

describe.sequential("administracion Bases del evento routes", () => {
  test("requires admin access and renders direct administration section links", async () => {
    const event = await createSavedEvent("Regional 2026");

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
    const inactiveEvent = await createSavedEvent("Nacional 2026", {
      activate: false,
    });

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

  test("creates modalidades, submodalidades, niveles y categorías from list actions", async () => {
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
  });

  test("updates niveles y categorías from list actions", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const level = await expectCreated(
      createExperienceLevel(event.id, { name: "Inicial" }),
    );
    const category = await expectCreated(
      createCategory(event.id, {
        name: "Infantil",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo", "duo"],
        modalityIds: [modality.id],
        experienceLevelIds: [level.id],
      }),
    );

    const editLevelRequest = await createSignedInRequest({
      email: "admin.edita.nivel@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias?evento=${event.id}`,
      body: formData({
        intent: "update-experience-level",
        id: level.id,
        name: "Principiante",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(editLevelRequest.request)),
      302,
    );
    await expect(
      db.query.experienceLevels.findFirst({
        where: eq(experienceLevels.id, level.id),
      }),
    ).resolves.toMatchObject({ name: "Principiante" });

    const editCategoryRequest = await createSignedInRequest({
      email: "admin.edita.categoria@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/categorias?evento=${event.id}`,
      body: formData({
        intent: "update-category",
        id: category.id,
        name: "Infantil A",
        minAge: "8",
        maxAge: "12",
        groupTypes: ["solo", "duo"],
        modalityIds: [modality.id],
        experienceLevelIds: [level.id],
      }),
    });

    await expectThrownResponse(
      action(routeArgs(editCategoryRequest.request)),
      302,
    );
    await expect(
      db.query.categories.findFirst({
        where: eq(categories.id, category.id),
      }),
    ).resolves.toMatchObject({ name: "Infantil A" });
  });

  test("deletes submodalidades from list actions", async () => {
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
    const deleteSubmodalityRequest = await createSignedInRequest({
      email: "admin.borra.submodalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades?evento=${event.id}`,
      body: formData({
        intent: "delete-submodality",
        id: submodality.id,
      }),
    });

    await expectThrownResponse(
      action(routeArgs(deleteSubmodalityRequest.request)),
      302,
    );
    await expect(
      db.query.submodalities.findFirst({
        where: eq(submodalities.id, submodality.id),
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
      where: eq(schedules.name, "Sábado Mañana"),
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
                name: "Precio base",
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
                name: "Precio bloque",
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
    expect(markup).toContain("Precio bloque");
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
      where: eq(schedules.name, "Sábado Mañana"),
    });
    const createPriceRequest = await createSignedInRequest({
      email: "admin.crea.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        name: "Precio bloque",
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
    expect(createMarkup).toContain("Precio especial");

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

    expect(detailMarkup).toContain("Precio bloque");
    expect(detailMarkup).toContain("31 de mayo de 2026");
    expect(detailMarkup).toContain('aria-label="Acciones"');

    const editPriceRequest = await createSignedInRequest({
      email: "admin.edita.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/${price?.id}?evento=${event.id}`,
      body: formData({
        intent: "update-price",
        id: price?.id ?? "",
        name: "Precio actualizado",
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
      name: "Precio actualizado",
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
      where: eq(schedules.name, "Sábado Mañana"),
    });
    const createPriceRequest = await createSignedInRequest({
      email: "admin.crea.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        name: "Precio bloque",
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
      name: "Precio bloque",
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

    expect(markup).toContain("Precio bloque");
    expect(markup).toContain("Solo");
    expect(markup).toContain("$15000");

    const editPriceRequest = await createSignedInRequest({
      email: "admin.edita.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      body: formData({
        intent: "update-price",
        id: price?.id ?? "",
        name: "Precio actualizado",
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
      name: "Precio actualizado",
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

  test("returns duplicate modalidad errors from Bases del evento actions", async () => {
    const event = await createSavedEvent("Regional 2026");
    await createModality(event.id, { name: "Jazz" });
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
  });

  test("returns category validation errors from Bases del evento actions", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

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
        modalityIds: [modality.id],
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
        modalityIds: [modality.id],
        experienceLevelIds: [],
      },
    });

    await expectCreated(
      createCategory(event.id, {
        name: "Mini",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [modality.id],
        experienceLevelIds: [],
      }),
    );

    const duplicateCategoryValues = {
      name: "Mini avanzado",
      minAge: "8",
      maxAge: "12",
      groupTypes: ["solo"],
      modalityIds: [modality.id],
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
  });

  test("returns precio validation errors from Bases del evento actions", async () => {
    const event = await createSavedEvent("Regional 2026");
    const createPriceRequest = await createSignedInRequest({
      email: "admin.precio.base@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        name: "Precio base",
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
        name: "Precio duplicado",
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
        name: "Precio duplicado",
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
        name: "Este campo es obligatorio.",
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
  });

  test("returns cronograma and cupo de cronograma required errors from Bases del evento actions", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
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
        modalityIds: [modality.id],
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
});

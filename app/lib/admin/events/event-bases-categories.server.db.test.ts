import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  categories,
  experienceLevels,
  modalities,
  submodalities,
} from "@/db/schema";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createSubmodality,
} from "@/lib/events/bases-repository.server";
import { loader } from "@/lib/admin/events/event-bases.server";

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
  routeArgs,
} from "./event-bases.test-helpers";

installDatabaseTestHooks();

describe.sequential("administracion Bases del evento routes", () => {
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
});

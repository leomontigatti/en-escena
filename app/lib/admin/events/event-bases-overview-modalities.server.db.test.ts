import { eq } from "drizzle-orm";
import { createElement } from "react";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, modalities, submodalities } from "@/db/schema";
import {
  createModality,
  createSubmodality,
} from "@/lib/modalities/repository.server";
import { expectFlashRedirect } from "@/lib/shared/flash-notification.test-support";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  action,
  createSavedEvent,
  createSignedInRequest,
  expectCreated,
  expectThrownResponse,
  formData,
  loader,
  renderCategoriaDetalleRoute,
  renderCategoriaNuevaRoute,
  renderModalidadesRoute,
  renderModalidadDetalleRoute,
  renderNuevaModalidadRoute,
  renderPrecioNuevoRoute,
  renderRoute,
  routeArgs,
} from "./event-bases.test-helpers";

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
    expect(markup).toContain("Bases");
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
    await expectFlashRedirect(
      response,
      `/administracion/modalidades/${modality?.id}`,
      {
        id: "route-notification:modalidad-guardada",
        message: "Modalidad guardada.",
        variant: "success",
      },
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

  test("renders the Agregar submodalidad editor on the Modalidad alta route", async () => {
    const event = await createSavedEvent("Regional 2026");

    const request = await createSignedInRequest({
      email: "admin.alta.submodalidades@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/nueva?evento=${event.id}`,
    });
    const data = await loader(routeArgs(request.request));
    const markup = renderNuevaModalidadRoute(data);

    expect(markup).toContain('aria-label="Agregar submodalidad"');
    expect(markup).toContain('name="submodalitiesMode" value="replace"');
  });

  test("creates a Modalidad with its Submodalidades from the alta route", async () => {
    const event = await createSavedEvent("Regional 2026");
    const createRequest = await createSignedInRequest({
      email: "admin.crea.modalidad.submodalidades@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/nueva?evento=${event.id}`,
      body: formData({
        intent: "create-modality",
        name: "Jazz",
        submodalitiesMode: "replace",
        "submodalities.0.name": "Commercial jazz",
        "submodalities.1.name": "Lyrical jazz",
      }),
    });

    const response = await expectThrownResponse(
      action(routeArgs(createRequest.request)),
      302,
    );
    const modality = await db.query.modalities.findFirst({
      where: eq(modalities.name, "Jazz"),
    });

    expect(modality).toMatchObject({ eventId: event.id });
    await expectFlashRedirect(
      response,
      `/administracion/modalidades/${modality?.id}`,
      {
        id: "route-notification:modalidad-guardada",
        message: "Modalidad guardada.",
        variant: "success",
      },
    );

    const savedSubmodalities = await db.query.submodalities.findMany({
      where: eq(submodalities.modalityId, modality?.id ?? ""),
    });

    expect(savedSubmodalities).toHaveLength(2);
    expect(savedSubmodalities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventId: event.id, name: "Commercial Jazz" }),
        expect.objectContaining({ eventId: event.id, name: "Lyrical Jazz" }),
      ]),
    );
  });

  test("creates a Modalidad with zero Submodalidades from the alta route", async () => {
    const event = await createSavedEvent("Regional 2026");
    const createRequest = await createSignedInRequest({
      email: "admin.crea.modalidad.sin.submodalidades@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/nueva?evento=${event.id}`,
      body: formData({
        intent: "create-modality",
        name: "Jazz",
        submodalitiesMode: "replace",
      }),
    });

    await expectThrownResponse(action(routeArgs(createRequest.request)), 302);

    const modality = await db.query.modalities.findFirst({
      where: eq(modalities.name, "Jazz"),
    });

    expect(modality).toMatchObject({ eventId: event.id });
    await expect(
      db.query.submodalities.findMany({
        where: eq(submodalities.modalityId, modality?.id ?? ""),
      }),
    ).resolves.toHaveLength(0);
  });

  test("rejects duplicate Submodalidad names server-side on Modalidad creation", async () => {
    const event = await createSavedEvent("Regional 2026");
    const createRequest = await createSignedInRequest({
      email: "admin.crea.modalidad.duplicada@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/nueva?evento=${event.id}`,
      body: formData({
        intent: "create-modality",
        name: "Jazz",
        submodalitiesMode: "replace",
        "submodalities.0.name": "Commercial jazz",
        "submodalities.1.name": "Commercial jazz",
      }),
    });

    const result = await action(routeArgs(createRequest.request));

    expect(result).toMatchObject({
      status: "error",
      scope: { intent: "create-modality" },
    });
    expect(result?.fieldErrors).toHaveProperty("submodalities.1.name");
    expect(result?.values).toMatchObject({
      name: "Jazz",
      submodalities: [{ name: "Commercial jazz" }, { name: "Commercial jazz" }],
    });
    await expect(
      db.query.modalities.findFirst({ where: eq(modalities.name, "Jazz") }),
    ).resolves.toBeUndefined();
  });

  test("rejects invalid Submodalidad rows server-side when the client is bypassed", async () => {
    const event = await createSavedEvent("Regional 2026");
    const createRequest = await createSignedInRequest({
      email: "admin.crea.modalidad.invalida@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/modalidades/nueva?evento=${event.id}`,
      body: formData({
        intent: "create-modality",
        name: "Jazz",
        submodalitiesMode: "replace",
        "submodalities.0.name": "Commercial jazz",
        "submodalities.1.name": "   ",
      }),
    });

    const result = await action(routeArgs(createRequest.request));

    expect(result).toMatchObject({
      status: "error",
      scope: { intent: "create-modality" },
    });
    expect(result?.fieldErrors).toHaveProperty("submodalities.1.name");
    await expect(
      db.query.modalities.findFirst({ where: eq(modalities.name, "Jazz") }),
    ).resolves.toBeUndefined();
  });
});

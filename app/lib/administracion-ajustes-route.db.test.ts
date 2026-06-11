import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  categories,
  experienceLevels,
  modalities,
  prices,
  scheduleEntries,
  scheduleBlocks,
  submodalities,
  user,
} from "@/db/schema";
import {
  createExperienceLevel,
  createModality,
} from "@/lib/admin-catalogs.server";
import { auth } from "@/lib/auth.server";
import { activateEvent, createEvent } from "@/lib/event-management.server";
import {
  action,
  AdministracionAjustesRouteView,
  loader,
} from "@/routes/administracion.ajustes";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/ajustes route", () => {
  test("requires admin access and renders empty catalog states for the Evento de trabajo", async () => {
    const event = await createSavedEvent("Regional 2026");
    await activateEvent(event.id);

    await expectThrownResponse(
      loader(routeArgs(new Request("http://localhost/administracion/ajustes"))),
      302,
    );

    const { request } = await createSignedInRequest({
      email: "admin.ajustes@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/ajustes",
    });

    const response = await expectThrownResponse(
      loader(routeArgs(request)),
      302,
    );
    expect(response.headers.get("location")).toBe(
      `/administracion/ajustes?evento=${event.id}`,
    );

    const selectedRequest = await createSignedInRequest({
      email: "admin.ajustes.seleccionado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
    });
    const data = await loader(routeArgs(selectedRequest.request));
    const markup = renderRoute(data);

    expect(data.selectedEventId).toBe(event.id);
    expect(markup).toContain("Ajustes de administración");
    expect(markup).toContain("Todavía no hay Modalidades para este Evento.");
    expect(markup).toContain("Todavía no hay Categorías para este Evento.");
    expect(markup).toContain("Todavía no hay Submodalidades para este Evento.");
    expect(markup).toContain(
      "Todavía no hay Niveles de experiencia para este Evento.",
    );
    expect(markup).toContain(
      "Todavía no hay Bloques horarios para este Evento.",
    );
    expect(markup).toContain("Todavía no hay Precios para este Evento.");
    expect(markup).toContain('name="intent" value="create-modality"');
    expect(markup).toContain('name="intent" value="create-category"');
    expect(markup).toContain('name="intent" value="create-submodality"');
    expect(markup).toContain('name="intent" value="create-experience-level"');
    expect(markup).toContain('name="intent" value="create-schedule-block"');
    expect(markup).toContain('name="intent" value="create-price"');
  });

  test("creates, edits and deletes catalogs through the admin action", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modalityRequest = await createSignedInRequest({
      email: "admin.crea.modalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
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
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "create-submodality",
        modalityId: modality?.id ?? "",
        name: "Jazz funk",
      }),
    });
    const levelRequest = await createSignedInRequest({
      email: "admin.crea.nivel@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
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
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
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
            email: "admin.lista.ajustes@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const markup = renderRoute(data);

    expect(markup).toContain("Jazz");
    expect(markup).toContain("Infantil");
    expect(markup).toContain("8 a 12 años");
    expect(markup).toContain("Solo, Dúo");
    expect(markup).toContain("Jazz funk");
    expect(markup).toContain("Inicial");

    const editLevelRequest = await createSignedInRequest({
      email: "admin.edita.nivel@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
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
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
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
      where: eq(submodalities.name, "Jazz funk"),
    });
    const deleteSubmodalityRequest = await createSignedInRequest({
      email: "admin.borra.submodalidad@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
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

  test("creates, edits and deletes Bloques horarios through the admin action", async () => {
    const event = await createSavedEvent("Regional 2026");
    await createModality(event.id, { name: "Jazz" });
    await createModality(event.id, { name: "Danzas urbanas" });
    const eventModalities = await db.query.modalities.findMany({
      where: eq(modalities.eventId, event.id),
    });
    const scheduleBlockRequest = await createSignedInRequest({
      email: "admin.crea.bloque@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "create-schedule-block",
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: "24",
        modalityIds: eventModalities.map((modality) => modality.id),
      }),
    });

    await expectThrownResponse(
      action(routeArgs(scheduleBlockRequest.request)),
      302,
    );

    const scheduleBlock = await db.query.scheduleBlocks.findFirst({
      where: eq(scheduleBlocks.name, "Sábado mañana"),
    });
    expect(scheduleBlock).toMatchObject({
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
            requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const markup = renderRoute(data);

    expect(markup).toContain("Sábado mañana");
    expect(markup).toContain("02/05/2026");
    expect(markup).toContain("09:00");
    expect(markup).toContain("24 cupos");
    expect(markup).toContain("Jazz");
    expect(markup).toContain("Danzas urbanas");

    const urbanas = eventModalities.find(
      (modality) => modality.name === "Danzas urbanas",
    );
    const editScheduleBlockRequest = await createSignedInRequest({
      email: "admin.edita.bloque@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "update-schedule-block",
        id: scheduleBlock?.id ?? "",
        name: "Sábado tarde",
        scheduledDate: "2026-05-02",
        startTime: "14:30",
        totalCapacity: "18",
        modalityIds: [urbanas?.id ?? ""],
      }),
    });

    await expectThrownResponse(
      action(routeArgs(editScheduleBlockRequest.request)),
      302,
    );
    await expect(
      db.query.scheduleBlocks.findFirst({
        where: eq(scheduleBlocks.id, scheduleBlock?.id ?? ""),
      }),
    ).resolves.toMatchObject({
      name: "Sábado tarde",
      startTime: "14:30",
      totalCapacity: 18,
    });

    const deleteScheduleBlockRequest = await createSignedInRequest({
      email: "admin.borra.bloque@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "delete-schedule-block",
        id: scheduleBlock?.id ?? "",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(deleteScheduleBlockRequest.request)),
      302,
    );
    await expect(
      db.query.scheduleBlocks.findFirst({
        where: eq(scheduleBlocks.id, scheduleBlock?.id ?? ""),
      }),
    ).resolves.toBeUndefined();
  });

  test("creates, edits and deletes Precios through the admin action", async () => {
    const event = await createSavedEvent("Regional 2026");
    await createModality(event.id, { name: "Jazz" });
    const modality = await db.query.modalities.findFirst({
      where: eq(modalities.eventId, event.id),
    });
    const blockRequest = await createSignedInRequest({
      email: "admin.precio.bloque@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "create-schedule-block",
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: "24",
        modalityIds: [modality?.id ?? ""],
      }),
    });
    await expectThrownResponse(action(routeArgs(blockRequest.request)), 302);

    const scheduleBlock = await db.query.scheduleBlocks.findFirst({
      where: eq(scheduleBlocks.name, "Sábado mañana"),
    });
    const createPriceRequest = await createSignedInRequest({
      email: "admin.crea.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        name: "Solo sábado",
        groupType: "solo",
        amount: "15000",
        scheduleBlockId: scheduleBlock?.id ?? "",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(createPriceRequest.request)),
      302,
    );

    const price = await db.query.prices.findFirst({
      where: eq(prices.name, "Solo sábado"),
    });
    expect(price).toMatchObject({
      eventId: event.id,
      groupType: "solo",
      amount: 15000,
      scheduleBlockId: scheduleBlock?.id,
    });

    const data = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.lista.precios@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const markup = renderRoute(data);

    expect(markup).toContain("Solo sábado");
    expect(markup).toContain("Solo");
    expect(markup).toContain("$15000");
    expect(markup).toContain("Sábado mañana");

    const editPriceRequest = await createSignedInRequest({
      email: "admin.edita.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "update-price",
        id: price?.id ?? "",
        name: "Solo general",
        groupType: "solo",
        amount: "12000",
        scheduleBlockId: "",
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
      name: "Solo general",
      amount: 12000,
      scheduleBlockId: null,
    });

    const deletePriceRequest = await createSignedInRequest({
      email: "admin.borra.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "delete-price",
        id: price?.id ?? "",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(deletePriceRequest.request)),
      302,
    );
    await expect(
      db.query.prices.findFirst({
        where: eq(prices.id, price?.id ?? ""),
      }),
    ).resolves.toBeUndefined();
  });

  test("creates, edits and deletes Cronogramas inside Bloques horarios through the admin action", async () => {
    const event = await createSavedEvent("Regional 2026");
    await createModality(event.id, { name: "Jazz" });
    const [modality] = await db.query.modalities.findMany({
      where: eq(modalities.eventId, event.id),
    });
    const scheduleBlockRequest = await createSignedInRequest({
      email: "admin.crea.bloque.cronograma@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "create-schedule-block",
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: "12",
        modalityIds: [modality?.id ?? ""],
      }),
    });

    await expectThrownResponse(
      action(routeArgs(scheduleBlockRequest.request)),
      302,
    );

    const scheduleBlock = await db.query.scheduleBlocks.findFirst({
      where: eq(scheduleBlocks.name, "Sábado mañana"),
    });
    const createScheduleEntryRequest = await createSignedInRequest({
      email: "admin.crea.cronograma@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "create-schedule-entry",
        scheduleBlockId: scheduleBlock?.id ?? "",
        groupTypes: ["solo", "duo"],
        capacity: "8",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(createScheduleEntryRequest.request)),
      302,
    );

    const scheduleEntry = await db.query.scheduleEntries.findFirst({
      where: eq(scheduleEntries.scheduleBlockId, scheduleBlock?.id ?? ""),
    });
    expect(scheduleEntry).toMatchObject({
      groupTypeKey: "solo|duo",
      capacity: 8,
    });

    const data = await loader(
      routeArgs(
        (
          await createSignedInRequest({
            email: "admin.lista.cronogramas@example.com",
            role: "admin",
            requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
          })
        ).request,
      ),
    );
    const markup = renderRoute(data);

    expect(markup).toContain("Cronogramas");
    expect(markup).toContain("Solo, Dúo");
    expect(markup).toContain("8 cupos");
    expect(markup).toContain('name="intent" value="create-schedule-entry"');

    const editScheduleEntryRequest = await createSignedInRequest({
      email: "admin.edita.cronograma@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "update-schedule-entry",
        id: scheduleEntry?.id ?? "",
        groupTypes: ["trio"],
        capacity: "4",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(editScheduleEntryRequest.request)),
      302,
    );
    await expect(
      db.query.scheduleEntries.findFirst({
        where: eq(scheduleEntries.id, scheduleEntry?.id ?? ""),
      }),
    ).resolves.toMatchObject({
      groupTypeKey: "trio",
      capacity: 4,
    });

    const deleteScheduleEntryRequest = await createSignedInRequest({
      email: "admin.borra.cronograma@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "delete-schedule-entry",
        id: scheduleEntry?.id ?? "",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(deleteScheduleEntryRequest.request)),
      302,
    );
    await expect(
      db.query.scheduleEntries.findFirst({
        where: eq(scheduleEntries.id, scheduleEntry?.id ?? ""),
      }),
    ).resolves.toBeUndefined();
  });

  test("returns Spanish validation errors from catalog actions", async () => {
    const event = await createSavedEvent("Regional 2026");
    const modality = await createModality(event.id, { name: "Jazz" });
    await createExperienceLevel(event.id, { name: "Inicial" });
    const duplicateRequest = await createSignedInRequest({
      email: "admin.duplicado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({ intent: "create-modality", name: " jazz " }),
    });

    await expect(action(routeArgs(duplicateRequest.request))).resolves.toEqual({
      status: "error",
      message: "Ya existe una Modalidad con ese nombre en este Evento.",
      fieldErrors: { name: "Usá un nombre distinto para la Modalidad." },
    });

    const invalidCategoryRequest = await createSignedInRequest({
      email: "admin.categoria.invalida@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
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
      message: "Revisá las edades de la Categoría.",
      fieldErrors: {
        ageRange: "La edad máxima debe ser mayor o igual a la mínima.",
      },
    });

    const createPriceRequest = await createSignedInRequest({
      email: "admin.precio.base@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        name: "Solo general",
        groupType: "solo",
        amount: "12000",
        scheduleBlockId: "",
      }),
    });

    await expectThrownResponse(
      action(routeArgs(createPriceRequest.request)),
      302,
    );

    const duplicatePriceRequest = await createSignedInRequest({
      email: "admin.precio.duplicado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/ajustes?evento=${event.id}`,
      body: formData({
        intent: "create-price",
        name: "Solo general alternativo",
        groupType: "solo",
        amount: "13000",
        scheduleBlockId: "",
      }),
    });

    await expect(
      action(routeArgs(duplicatePriceRequest.request)),
    ).resolves.toEqual({
      status: "error",
      message: "Ya existe un Precio general para ese Tipo de grupo.",
      fieldErrors: {
        groupType: "Revisá el Tipo de grupo del Precio.",
      },
    });
  });
});

async function createSavedEvent(name: string) {
  const result = await createEvent({
    name,
    registrationStartsAt: new Date("2026-03-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-04-30T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

function renderRoute(
  loaderData: Parameters<
    typeof AdministracionAjustesRouteView
  >[0]["loaderData"],
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/administracion/ajustes"] },
      createElement(AdministracionAjustesRouteView, { loaderData }),
    ),
  );
}

async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requestUrl: string;
  body?: FormData;
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
    pattern: "/administracion/ajustes",
  };
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected Better Auth to return a session cookie.");
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

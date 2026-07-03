import { describe, expect, test } from "vitest";

import { createCategory } from "@/lib/categories/repository.server";
import { createModality } from "@/lib/modalities/repository.server";
import { createSchedule } from "@/lib/schedules/repository.server";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  action,
  createSavedEvent,
  createSignedInRequest,
  expectCreated,
  expectThrownResponse,
  formData,
  loader,
  renderModalidadDetalleRoute,
  renderNuevaModalidadRoute,
  routeArgs,
} from "./event-bases.test-helpers";

installDatabaseTestHooks();

describe.sequential("administracion Bases del evento routes", () => {
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
        experienceLevels: [],
      },
    });

    await expectCreated(
      createCategory(event.id, {
        name: "Mini",
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [modality.id],
        experienceLevels: [],
      }),
    );

    const duplicateCategoryValues = {
      name: "Mini avanzado",
      minAge: "8",
      maxAge: "12",
      groupTypes: ["solo"],
      modalityIds: [modality.id],
      experienceLevels: [],
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
    expect(createMarkup).not.toContain(
      "Usá un nombre distinto para la modalidad.",
    );
    expect(detailMarkup).not.toContain(
      "Usá un nombre distinto para la modalidad.",
    );
    expect(detailMarkup).not.toContain("Ingresá el nombre de la submodalidad.");
  });
});

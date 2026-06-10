import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  experienceLevels,
  modalities,
  scheduleBlocks,
  submodalities,
  user,
} from "@/db/schema";
import { createModality } from "@/lib/admin-catalogs.server";
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
    expect(markup).toContain("Todavía no hay Submodalidades para este Evento.");
    expect(markup).toContain(
      "Todavía no hay Niveles de experiencia para este Evento.",
    );
    expect(markup).toContain(
      "Todavía no hay Bloques horarios para este Evento.",
    );
    expect(markup).toContain('name="intent" value="create-modality"');
    expect(markup).toContain('name="intent" value="create-submodality"');
    expect(markup).toContain('name="intent" value="create-experience-level"');
    expect(markup).toContain('name="intent" value="create-schedule-block"');
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
    expect(markup).toContain("Jazz funk");
    expect(markup).toContain("Inicial");

    const level = await db.query.experienceLevels.findFirst({
      where: eq(experienceLevels.name, "Inicial"),
    });
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

  test("returns Spanish validation errors from catalog actions", async () => {
    const event = await createSavedEvent("Regional 2026");
    await createModality(event.id, { name: "Jazz" });
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
    } else {
      form.set(key, value);
    }
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

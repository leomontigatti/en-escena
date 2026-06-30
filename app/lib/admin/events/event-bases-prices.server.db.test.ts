import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { modalities, prices, schedules } from "@/db/schema";
import { createModality } from "@/lib/events/bases-repository.server";
import { loader } from "@/lib/admin/events/event-bases.server";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  action,
  createSavedEvent,
  createSignedInRequest,
  expectCreated,
  expectThrownResponse,
  formData,
  renderPrecioDetalleRoute,
  renderPrecioNuevoRoute,
  renderPreciosRoute,
  routeArgs,
} from "./event-bases.test-helpers";

installDatabaseTestHooks();

describe.sequential("administracion Bases del evento routes", () => {
  test("renders precios without the event deposit percentage form", async () => {
    const event = await createSavedEvent("Regional 2026");
    const listRequest = await createSignedInRequest({
      email: "admin.precios.sin.sena@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
    });
    const initialData = await loader(routeArgs(listRequest.request));
    const initialMarkup = renderPreciosRoute(initialData);

    expect(initialData.requiredDepositPercentage).toBe(30);
    expect(initialMarkup).toContain("Precios");
    expect(initialMarkup).not.toContain("Seña de coreografía");
    expect(initialMarkup).not.toContain('name="requiredDepositPercentage"');
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
    expect(markup).toContain("$ 15.000");

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
});

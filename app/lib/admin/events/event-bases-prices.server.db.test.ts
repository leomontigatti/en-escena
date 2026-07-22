import { describe, expect, test } from "vitest";

import { freezeInscriptionDepositForTest } from "@/features/portal/choreographies/test-support/db";
import { createAccountCurrentChoreographyFixture } from "@/lib/admin/academies/account-current-route.test-support";
import { expectFlashRedirect } from "@/lib/shared/flash-notification.test-support";
import { installDatabaseTestHooks } from "../../../../tests/db/harness";
import {
  createDeletePriceAdminRequest,
  createEventPriceAdminFixture,
  createPriceAdminRequest,
  expectPriceDeletedRedirect,
  expectPriceSavedRedirect,
  findSavedPriceById,
  findSavedPriceByScope,
} from "./event-bases-price.test-helpers";
import {
  action,
  createSavedEvent,
  createSignedInRequest,
  expectThrownResponse,
  loader,
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
    const { event, schedule } = await createEventPriceAdminFixture();
    const createBasePriceRequest = await createPriceAdminRequest({
      email: "admin.precio.base.lista@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
      intent: "create-price",
    });
    const createSchedulePriceRequest = await createPriceAdminRequest({
      email: "admin.crea.precio.bloque.lista@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
      intent: "create-price",
      price: {
        name: "Precio bloque",
        amount: "15000",
        scheduleId: schedule.id,
      },
    });

    await expectThrownResponse(
      action(routeArgs(createBasePriceRequest.request)),
      302,
    );
    await expectThrownResponse(
      action(routeArgs(createSchedulePriceRequest.request)),
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
    const { event, schedule } = await createEventPriceAdminFixture();
    const createPriceRequest = await createPriceAdminRequest({
      email: "admin.crea.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/nuevo?evento=${event.id}`,
      intent: "create-price",
      price: {
        name: "Precio bloque",
        amount: "15000",
        scheduleId: schedule.id,
      },
    });

    const createResponse = await expectThrownResponse(
      action(routeArgs(createPriceRequest.request)),
      302,
    );

    const price = await findSavedPriceByScope({
      groupType: "solo",
      paymentDeadline: "2026-05-31",
      scheduleId: schedule.id,
    });
    await expectPriceSavedRedirect(createResponse);

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

    const editPriceRequest = await createPriceAdminRequest({
      email: "admin.edita.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/${price?.id}?evento=${event.id}`,
      intent: "update-price",
      priceId: price?.id ?? "",
      price: {
        name: "Precio actualizado",
        amount: "12000",
        paymentDeadline: "2026-06-30",
        scheduleId: "",
      },
    });

    await expectThrownResponse(
      action(routeArgs(editPriceRequest.request)),
      302,
    );
    await expect(findSavedPriceById(price?.id ?? "")).resolves.toMatchObject({
      name: "Precio actualizado",
      amount: 12000,
      paymentDeadline: "2026-06-30",
      scheduleId: null,
    });

    const blockedDeleteRequest = await createDeletePriceAdminRequest({
      email: "admin.borra.precio.bloqueado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/${price?.id}?evento=${event.id}`,
      priceId: price?.id ?? "",
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

    const deletePriceRequest = await createDeletePriceAdminRequest({
      email: "admin.borra.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/${price?.id}?evento=${event.id}`,
      priceId: price?.id ?? "",
      confirmDeletion: price?.id ?? "",
    });

    const deleteResponse = await expectThrownResponse(
      action(routeArgs(deletePriceRequest.request)),
      302,
    );
    await expectPriceDeletedRedirect(deleteResponse);
  });

  test("shows a frozen inscription validation when structural changes or deletion are blocked", async () => {
    const event = await createSavedEvent("Regional 2032");
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Precio Historial",
        choreographyName: "Coreografía Historial",
        email: "admin.precio.historial@example.com",
        event,
      });

    const price = await findSavedPriceByScope({
      groupType: "solo",
      paymentDeadline: "2026-05-31",
      scheduleId: null,
    });

    if (!price) {
      throw new Error("Expected seeded price fixture.");
    }

    await freezeInscriptionDepositForTest({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      selectedPriceId: price.id,
    });

    const updatePriceRequest = await createPriceAdminRequest({
      email: "admin.bloqueo.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/${price.id}?evento=${event.id}`,
      intent: "update-price",
      priceId: price.id,
      price: {
        amount: "12000",
        paymentDeadline: "2026-05-31",
      },
    });

    await expect(
      action(routeArgs(updatePriceRequest.request)),
    ).resolves.toEqual({
      status: "error",
      message:
        "No se pueden editar monto, tipo de grupo, vencimiento ni cronograma porque hay inscripciones que congelaron este precio.",
      fieldErrors: {},
      scope: {
        intent: "update-price",
        recordId: price.id,
      },
      values: {
        amount: "12000",
        groupType: "solo",
        isSpecialPrice: "",
        name: "Precio base",
        paymentDeadline: "2026-05-31",
        scheduleId: "",
      },
    });

    const deletePriceRequest = await createDeletePriceAdminRequest({
      email: "admin.borra.precio.historial@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios/${price.id}?evento=${event.id}`,
      priceId: price.id,
      confirmDeletion: price.id,
    });

    await expect(
      action(routeArgs(deletePriceRequest.request)),
    ).resolves.toEqual({
      status: "error",
      message:
        "No se puede borrar el precio porque hay inscripciones que congelaron este precio.",
      fieldErrors: {},
      scope: {
        intent: "delete-price",
        recordId: price.id,
      },
    });
  });

  test("creates, edits and deletes precios through the admin action", async () => {
    const { event, schedule } = await createEventPriceAdminFixture();
    const createPriceRequest = await createPriceAdminRequest({
      email: "admin.crea.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      intent: "create-price",
      price: {
        name: "Precio bloque",
        amount: "15000",
        scheduleId: schedule.id,
      },
    });

    const createPriceResponse = await expectThrownResponse(
      action(routeArgs(createPriceRequest.request)),
      302,
    );
    await expectPriceSavedRedirect(createPriceResponse);

    const price = await findSavedPriceByScope({
      groupType: "solo",
      paymentDeadline: "2026-05-31",
      scheduleId: schedule.id,
    });
    expect(price).toMatchObject({
      eventId: event.id,
      name: "Precio bloque",
      groupType: "solo",
      amount: 15000,
      paymentDeadline: "2026-05-31",
      scheduleId: schedule.id,
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

    const editPriceRequest = await createPriceAdminRequest({
      email: "admin.edita.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      intent: "update-price",
      priceId: price?.id ?? "",
      price: {
        name: "Precio actualizado",
        amount: "12000",
        paymentDeadline: "2026-06-30",
        scheduleId: "",
      },
    });

    const updatePriceResponse = await expectThrownResponse(
      action(routeArgs(editPriceRequest.request)),
      302,
    );
    await expectFlashRedirect(updatePriceResponse, "/administracion/precios", {
      id: "route-notification:precio-guardado",
      message: "Precio guardado.",
      variant: "success",
    });
    await expect(findSavedPriceById(price?.id ?? "")).resolves.toMatchObject({
      name: "Precio actualizado",
      amount: 12000,
      paymentDeadline: "2026-06-30",
      scheduleId: null,
    });

    const deletePriceRequest = await createDeletePriceAdminRequest({
      email: "admin.borra.precio@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/precios?evento=${event.id}`,
      priceId: price?.id ?? "",
    });

    const deletePriceResponse = await expectThrownResponse(
      action(routeArgs(deletePriceRequest.request)),
      302,
    );
    await expectPriceDeletedRedirect(deletePriceResponse);
    await expect(findSavedPriceById(price?.id ?? "")).resolves.toBeUndefined();
  });
});

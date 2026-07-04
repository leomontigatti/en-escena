import { describe, expect, test } from "vitest";

import { createSignedInAdminRequest as createSignedInRequest } from "@/lib/admin/test-support/db";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import { loadAdministrativeChoreographyListRouteData } from "@/features/admin/choreographies/list/server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe("loadAdministrativeChoreographyListRouteData", () => {
  test("redirects invalid filters to the canonical list URL", async () => {
    const event = await createSavedEvent();
    const { request } = await createSignedInRequest({
      email: "admin.coreografias.feature@example.com",
      role: "admin",
      requestUrl:
        `http://localhost/administracion/coreografias?evento=${event.id}` +
        "&estado=pendiente&modalidad=modalidad_invalida" +
        "&categoria=categoria_invalida&tipo-grupo=pareja&pagina=2",
    });

    const response = await expectThrownResponse(
      loadAdministrativeChoreographyListRouteData(request),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      `/administracion/coreografias?evento=${event.id}`,
    );
  });
});

async function createSavedEvent() {
  const result = await createEvent({
    name: "Nacional 2026",
    registrationStartsAt: new Date("2026-08-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-09-15T12:00:00Z"),
    startsAt: new Date("2026-10-01T12:00:00Z"),
    endsAt: new Date("2026-10-10T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  await activateEvent(result.event.id);

  return result.event;
}

async function expectThrownResponse<T>(
  promise: Promise<T>,
  expectedStatus: number,
) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBe(expectedStatus);
    return response;
  }

  throw new Error(`Expected a Response with status ${expectedStatus}.`);
}

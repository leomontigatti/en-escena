import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import {
  action,
  internalInvitationRedirectPath,
  loader,
} from "@/routes/administracion.usuarios_.invitaciones";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/usuarios/invitaciones route", () => {
  test("redirects administrators to direct internal user creation", async () => {
    const { request: loaderRequest } = await createSignedInRequest({
      email: "admin.invitaciones.loader@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios/invitaciones",
    });
    const { request: actionRequest } = await createSignedInRequest({
      email: "admin.invitaciones.action@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/usuarios/invitaciones",
      body: new FormData(),
    });

    const loaderResponse = await expectThrownResponse(
      loader(routeArgs(loaderRequest)),
      302,
    );
    const actionResponse = await expectThrownResponse(
      action(routeArgs(actionRequest)),
      302,
    );

    expect(loaderResponse.headers.get("location")).toBe(
      internalInvitationRedirectPath,
    );
    expect(actionResponse.headers.get("location")).toBe(
      internalInvitationRedirectPath,
    );
  });
});

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/usuarios/invitaciones",
  };
}

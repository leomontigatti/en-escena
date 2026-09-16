import { describe, expect, test } from "vitest";

import { getErrorBoundaryCopy } from "./root";

function errorResponse(status: number, data: unknown, statusText = "") {
  return { status, statusText, data, internal: false };
}

describe("getErrorBoundaryCopy", () => {
  test("renders the message a thrown 404 Response carries", () => {
    expect(
      getErrorBoundaryCopy(errorResponse(404, "No encontramos esa academia.")),
    ).toEqual({
      title: "Página no encontrada",
      description: "No encontramos esa academia.",
    });
  });

  test("renders the message a thrown 403 Response carries", () => {
    expect(
      getErrorBoundaryCopy(
        errorResponse(403, "No tenés acceso a esta sección."),
      ),
    ).toEqual({
      title: "Error 403",
      description: "No tenés acceso a esta sección.",
    });
  });

  test("falls back to the statusText when the body is empty", () => {
    expect(getErrorBoundaryCopy(errorResponse(400, "", "Bad Request"))).toEqual(
      {
        title: "Error 400",
        description: "Bad Request",
      },
    );
  });

  test("falls back to the generic description for an empty body", () => {
    expect(getErrorBoundaryCopy(errorResponse(404, ""))).toEqual({
      title: "Página no encontrada",
      description: "La aplicación no pudo completar la solicitud.",
    });
  });

  test("never prints a non-string body", () => {
    expect(
      getErrorBoundaryCopy(
        errorResponse(400, { message: "Acción no soportada." }),
      ),
    ).toEqual({
      title: "Error 400",
      description: "La aplicación no pudo completar la solicitud.",
    });
  });

  test("shows the message of an Error instance", () => {
    expect(getErrorBoundaryCopy(new Error("Unexpected Server Error"))).toEqual({
      title: "Ocurrió un error",
      description: "Unexpected Server Error",
    });
  });

  test("falls back to the generic copy for anything else", () => {
    expect(getErrorBoundaryCopy("boom")).toEqual({
      title: "Ocurrió un error",
      description: "La aplicación no pudo completar la solicitud.",
    });
  });
});

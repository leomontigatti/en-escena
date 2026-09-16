import { isRouteErrorResponse, UNSAFE_ErrorResponseImpl } from "react-router";
import { describe, expect, test } from "vitest";

import { getErrorBoundaryCopy } from "./root";

const genericDescription = "La aplicación no pudo completar la solicitud.";

/**
 * The value React Router hands the boundary. It builds one of these itself for
 * a thrown `Response` (`internal: false`, body text in `data`) and for its own
 * failures (`internal: true`, a stringified `Error` in `data`), so the tests
 * use its class rather than an object literal shaped to pass the duck-type
 * check in `isRouteErrorResponse`.
 */
function errorResponse(
  status: number,
  data: unknown,
  { statusText = "", internal = false } = {},
) {
  return new UNSAFE_ErrorResponseImpl(status, statusText, data, internal);
}

describe("getErrorBoundaryCopy", () => {
  test("the fixtures are what React Router calls an error response", () => {
    expect(isRouteErrorResponse(errorResponse(404, ""))).toBe(true);
  });

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
    expect(
      getErrorBoundaryCopy(
        errorResponse(400, "", { statusText: "Bad Request" }),
      ),
    ).toEqual({
      title: "Error 400",
      description: "Bad Request",
    });
  });

  test("falls back to the generic description for an empty body", () => {
    expect(getErrorBoundaryCopy(errorResponse(404, ""))).toEqual({
      title: "Página no encontrada",
      description: genericDescription,
    });
  });

  test("never prints a non-string body", () => {
    expect(
      getErrorBoundaryCopy(
        errorResponse(400, { message: "Acción no soportada." }),
      ),
    ).toEqual({
      title: "Error 400",
      description: genericDescription,
    });
  });

  test("never prints the developer text of an internal 404", () => {
    // What React Router itself throws for an unknown URL: `data` is a non-empty
    // string, but it is `Error: No route matches URL "/..."`.
    const unknownUrl = errorResponse(
      404,
      new Error('No route matches URL "/administracion/abc"'),
      { statusText: "Not Found", internal: true },
    );

    expect(unknownUrl.data).toContain("No route matches URL");
    expect(getErrorBoundaryCopy(unknownUrl)).toEqual({
      title: "Página no encontrada",
      description: "Not Found",
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
      description: genericDescription,
    });
  });
});

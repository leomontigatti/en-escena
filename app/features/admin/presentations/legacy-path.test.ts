import { describe, expect, test } from "vitest";

import { redirectLegacyPresentationsPath } from "./legacy-path";

function locationOf(url: string) {
  const response = redirectLegacyPresentationsPath(new Request(url));

  return {
    location: response.headers.get("Location"),
    status: response.status,
  };
}

describe("redirectLegacyPresentationsPath", () => {
  test("sends the old list, with its query, to the plural path for good", () => {
    expect(
      locationOf(
        "http://localhost/administracion/presentacion?dia=2026-10-10&pagina=2",
      ),
    ).toEqual({
      location: "/administracion/presentaciones?dia=2026-10-10&pagina=2",
      status: 301,
    });
  });

  test("keeps everything below the old path", () => {
    expect(
      locationOf("http://localhost/administracion/presentacion/p-1/puntajes"),
    ).toEqual({
      location: "/administracion/presentaciones/p-1/puntajes",
      status: 301,
    });
    expect(
      locationOf(
        "http://localhost/administracion/presentacion/resultados/imprimir?cronograma=s-1&cronograma=s-2",
      ).location,
    ).toBe(
      "/administracion/presentaciones/resultados/imprimir?cronograma=s-1&cronograma=s-2",
    );
  });
});

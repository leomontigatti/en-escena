import { describe, expect, test } from "vitest";

import {
  buildCreatePath,
  buildDetailPath,
  buildListPath,
  isDetailPath,
} from "./navigation";

describe("resource navigation helpers", () => {
  test("build resource URLs and detect dedicated detail routes", () => {
    expect(
      buildCreatePath("/administracion/categorias", "evento_2026", "nueva"),
    ).toBe("/administracion/categorias/nueva");
    expect(buildCreatePath("/administracion/precios", "evento_2026")).toBe(
      "/administracion/precios/nuevo",
    );
    expect(buildListPath("/administracion/categorias", "evento_2026")).toBe(
      "/administracion/categorias",
    );
    expect(
      buildDetailPath(
        "/administracion/categorias",
        "categoria_1",
        "evento_2026",
      ),
    ).toBe("/administracion/categorias/categoria_1");

    expect(
      isDetailPath(
        "/administracion/categorias",
        "http://localhost/administracion/categorias/categoria_1",
      ),
    ).toBe(true);
    expect(
      isDetailPath(
        "/administracion/categorias",
        "http://localhost/administracion/categorias",
      ),
    ).toBe(false);
    expect(
      isDetailPath(
        "/administracion/categorias",
        "http://localhost/administracion/categorias/extra/path",
      ),
    ).toBe(false);
  });
});

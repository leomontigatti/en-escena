import { describe, expect, test } from "vitest";

import {
  buildCategoryCreatePath,
  buildCategoryDetailPath,
  buildCategoriasListPath,
  buildModalidadDetallePath,
  buildModalidadesListPath,
  buildNewSchedulePath,
  buildNuevaModalidadPath,
  buildPriceCreatePath,
  buildPriceDetailPath,
  buildPriceListPath,
  buildScheduleDetailPath,
  buildSchedulesPath,
  isCategoryDetailPath,
  isModalityDetailPath,
  isPriceDetailPath,
  isScheduleDetailPath,
} from "@/lib/admin/events/event-bases-navigation";

describe("event bases navigation helpers", () => {
  test("keep Bases del evento URLs unchanged and detect dedicated detail routes", () => {
    expect(buildCategoryCreatePath("evento_2026")).toBe(
      "/administracion/categorias/nueva",
    );
    expect(buildCategoriasListPath("evento_2026")).toBe(
      "/administracion/categorias",
    );
    expect(buildCategoryDetailPath("categoria_1", "evento_2026")).toBe(
      "/administracion/categorias/categoria_1",
    );

    expect(buildModalidadesListPath("evento_2026")).toBe(
      "/administracion/modalidades",
    );
    expect(buildNuevaModalidadPath("evento_2026")).toBe(
      "/administracion/modalidades/nueva",
    );
    expect(buildModalidadDetallePath("modalidad_1", "evento_2026")).toBe(
      "/administracion/modalidades/modalidad_1",
    );

    expect(buildSchedulesPath("evento_2026")).toBe(
      "/administracion/cronogramas",
    );
    expect(buildNewSchedulePath("evento_2026")).toBe(
      "/administracion/cronogramas/nuevo",
    );
    expect(buildScheduleDetailPath("cronograma_1", "evento_2026")).toBe(
      "/administracion/cronogramas/cronograma_1",
    );

    expect(buildPriceListPath("evento_2026")).toBe("/administracion/precios");
    expect(buildPriceCreatePath("evento_2026")).toBe(
      "/administracion/precios/nuevo",
    );
    expect(buildPriceDetailPath("precio_1", "evento_2026")).toBe(
      "/administracion/precios/precio_1",
    );

    expect(
      isCategoryDetailPath(
        "http://localhost/administracion/categorias/categoria_1?evento=evento_2026",
      ),
    ).toBe(true);
    expect(
      isModalityDetailPath(
        "http://localhost/administracion/modalidades/modalidad_1?evento=evento_2026",
      ),
    ).toBe(true);
    expect(
      isScheduleDetailPath(
        "http://localhost/administracion/cronogramas/cronograma_1?evento=evento_2026",
      ),
    ).toBe(true);
    expect(
      isPriceDetailPath(
        "http://localhost/administracion/precios/precio_1?evento=evento_2026",
      ),
    ).toBe(true);

    expect(
      isCategoryDetailPath("http://localhost/administracion/categorias"),
    ).toBe(false);
    expect(
      isModalityDetailPath("http://localhost/administracion/modalidades"),
    ).toBe(false);
    expect(
      isScheduleDetailPath("http://localhost/administracion/cronogramas"),
    ).toBe(false);
    expect(
      isPriceDetailPath("http://localhost/administracion/precios/extra/path"),
    ).toBe(false);
  });
});

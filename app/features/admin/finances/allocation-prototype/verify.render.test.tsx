import { describe, expect, it } from "vitest";

import { renderRouteView } from "@/features/admin/test-support/render-route-view";

import { AllocationDetailPrototypeView } from "./detail-view";
import { AllocationListPrototypeView } from "./list-view";

const listMarkers = [
  ["A", "Tipo de grupo"],
  ["B", "Les falta la seña"],
  ["C", "Hasta dónde llega"],
] as const;

const detailMarkers = [
  ["A", "Asignado"],
  ["B", "Avance"],
  ["C", "De este pago"],
] as const;

describe("allocation prototype", () => {
  it.each(listMarkers)(
    "renders list variant %s instead of the event-required empty state",
    (variant, marker) => {
      const markup = renderRouteView(
        <AllocationListPrototypeView />,
        `/administracion/finanzas/prototipo-asignacion?variant=${variant}`,
      );

      expect(markup).not.toContain("Elegí un evento activo");
      expect(markup).toContain(marker);
      expect(markup).toContain("Estado del prototipo");
    },
  );

  it.each(detailMarkers)(
    "renders detail variant %s instead of the event-required empty state",
    (variant, marker) => {
      const markup = renderRouteView(
        <AllocationDetailPrototypeView />,
        `/administracion/finanzas/prototipo-asignacion/coreografia?variant=${variant}`,
      );

      expect(markup).not.toContain("Elegí un evento activo");
      expect(markup).toContain(marker);
      expect(markup).toContain("Estado del prototipo");
    },
  );
});

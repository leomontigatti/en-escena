import { describe, expect, it } from "vitest";

import { renderRouteView } from "@/features/admin/test-support/render-route-view";

import { AllocationPrototypeRouteView } from "./view";

const variantMarkers = [
  ["A", "De este pago"],
  ["B", "Asignado / adeudado"],
  ["C", "Reparto"],
] as const;

describe("allocation prototype", () => {
  it.each(variantMarkers)(
    "renders variant %s instead of the event-required empty state",
    (variant, marker) => {
      const markup = renderRouteView(
        <AllocationPrototypeRouteView />,
        `/administracion/finanzas/prototipo-asignacion?variant=${variant}`,
      );

      expect(markup).not.toContain("Elegí un evento activo");
      expect(markup).toContain(marker);
      expect(markup).toContain("Estado del prototipo");
    },
  );
});

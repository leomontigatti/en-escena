import { describe, expect, it } from "vitest";

import { renderRouteView } from "@/features/admin/test-support/render-route-view";

import { AllocationDetailPrototypeView } from "./detail-view";
import { AllocationListPrototypeView } from "./list-view";

const detailMarkers = [
  ["A", "Asignado"],
  ["B", "Avance"],
  ["C", "De este pago"],
] as const;

describe("allocation prototype", () => {
  it("renders the list with its figures and the actions menu", () => {
    const markup = renderRouteView(
      <AllocationListPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion",
    );

    expect(markup).not.toContain("Elegí un evento activo");
    expect(markup).toContain("Tipo de grupo");
    expect(markup).toContain("Seña adeudada");
    expect(markup).toContain("Saldo disponible");
    expect(markup).toContain("Acciones");
    expect(markup).toContain("Estado del prototipo");
  });

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

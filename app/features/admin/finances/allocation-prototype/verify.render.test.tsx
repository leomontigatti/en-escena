import { describe, expect, it } from "vitest";

import { renderRouteView } from "@/features/admin/test-support/render-route-view";

import { AllocationDetailPrototypeView } from "./detail-view";
import { AllocationListPrototypeView } from "./list-view";

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

  it("titles the detail with the choreography and carries the five metrics", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-1",
    );

    expect(markup).not.toContain("Elegí un evento activo");
    // The title is the choreography, not the generic "Detalle financiero".
    expect(markup).toContain('<h2 class="text-xl font-semibold">Reflejos</h2>');
    for (const metric of [
      "Seña adeudada",
      "Saldo adeudado",
      "Saldo disponible",
    ]) {
      expect(markup).toContain(metric);
    }
    expect(markup).toContain("Qué cubrió cada pago");
    expect(markup).toContain("Estado del prototipo");
  });

  it("shows the group type of the chosen choreography as a badge", () => {
    const markup = renderRouteView(
      <AllocationDetailPrototypeView />,
      "/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=cho-2",
    );

    expect(markup).toContain("Umbral");
    expect(markup).toContain("Dúo");
  });
});
